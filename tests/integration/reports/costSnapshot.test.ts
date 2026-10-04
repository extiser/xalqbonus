import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { grantManualReward } from '#server/services/rewards/grantManualReward';
import { issueOfficeReward } from '#server/services/rewards/issueOfficeReward';
import { placeDeskOrder } from '#server/services/orders/placeDeskOrder';
import { readPointsEconomyReport } from '#server/services/reports/readPointsEconomyReport';
import { readRewardsReport } from '#server/services/reports/readRewardsReport';
import { readSalesReport } from '#server/services/reports/readSalesReport';
import type { PeriodReportParams } from '#server/services/reports/reportParams';
import { missingCostNote, NO_COST_NOTE } from '#server/services/reports/reportTable';
import { receiveStock } from '#server/services/stock/receiveStock';
import { formatDayKey, shiftDayKey } from '#server/utils/parkTime';
import type { ReportCell, ReportResult } from '#shared/types/reports';
import {
  cleanupTestData,
  clearTestOrderItemCost,
  createTestOffice,
  createTestPerson,
  createTestProduct,
  disconnectDatabase,
  setTestProductCost,
} from '../support/database';
import { cleanupTestEmployees, createTestEmployee } from '../support/employees';
import { grantPoints } from '../support/points';
import { disconnectQueues } from '../support/queues';
import { clearTestRewardCost } from '../support/rewards';

/**
 * Себестоимость в отчётах — по снимку в строке заказа и в награде, а не по текущему каталогу
 * (issue #372).
 *
 * Запросы отчётов сырые — третье исключение правила тестов (docs/infra.md → «Тесты»): здесь
 * они проходят в настоящую базу через сервисы, которыми их читают ручки.
 *
 * «Экономика балла» считается по всему парку, и в тестовой базе рядом могут лежать чужие
 * строки. Поэтому её цифры сравниваются с ней же до и после, а не с числом: продажи и награды
 * сужены офисом теста и сверяются точно.
 */

const COST_NOTE =
  'Себестоимость — на момент заказа или награды; у выданного до снимка — по цене каталога на день, когда снимок заведён.';

type OfficeWorker = { employeeId: string; role: 'owner'; isDemo: boolean };

type Scenario = {
  personId: string;
  officeId: string;
  /** Товар за баллы: 40 баллов, себестоимость фикстуры — 32 000 сумов. */
  productId: string;
  /** Приз без цены в баллах: себестоимость фикстуры — 4 000 сумов. */
  prizeId: string;
  owner: OfficeWorker;
  period: PeriodReportParams;
};

/**
 * Участник с баллами, офис с товаром и призом на полке, владелец. Период — вчера–завтра
 * по Ташкенту: выдача в тесте у полуночи не уходит за край.
 */
const scenario = async (): Promise<Scenario> => {
  const person = await createTestPerson({ inProgram: true });
  const officeId = await createTestOffice();
  const productId = await createTestProduct({ pricePoints: 40 });
  const prizeId = await createTestProduct({ pricePoints: null, promo: true, hiddenInCatalog: true });
  const { employeeId } = await createTestEmployee({ role: 'owner' });

  await grantPoints(person.personId, 500);
  await receiveStock({ officeId, productId, quantity: 5, employeeId });
  await receiveStock({ officeId, productId: prizeId, quantity: 5, employeeId });

  const today = formatDayKey(new Date());

  return {
    personId: person.personId,
    officeId,
    productId,
    prizeId,
    owner: { employeeId, role: 'owner', isDemo: false },
    period: {
      from: shiftDayKey(today, -1),
      to: shiftDayKey(today, 1),
      office: { officeId, name: 'Тестовый офис', archived: false },
    },
  };
};

/** Заказ у стойки за баллы — выдан сразу, то есть продажа. */
const sell = async (scenario: Scenario, quantity: number): Promise<string> => {
  const placed = await placeDeskOrder(scenario.owner, {
    officeId: scenario.officeId,
    personId: scenario.personId,
    payment: 'points',
    items: [{ productId: scenario.productId, quantity }],
    actor: 'web',
  });

  return placed.orderId;
};

/** Приз вручён и выдан на стойке. */
const giveOutPrize = async (scenario: Scenario): Promise<string> => {
  const reward = await grantManualReward({
    personId: scenario.personId,
    employeeId: scenario.owner.employeeId,
    kind: 'product',
    productId: scenario.prizeId,
    title: null,
    officeId: scenario.officeId,
    untilDate: '2099-01-01',
    noteRu: 'за помощь новичкам',
    noteUz: 'yangi haydovchilarga yordam uchun',
    messageRu: '',
    messageUz: '',
    coverRu: null,
    coverUz: null,
    sendNow: false,
  });

  await issueOfficeReward(scenario.owner, reward.id);

  return reward.id;
};

/** Строки раздела без итогов. */
const sectionRows = (report: ReportResult, title: string): Record<string, ReportCell>[] => {
  const section = report.sections.find((candidate) => candidate.title === title);

  if (!section) {
    throw new Error(`раздела «${title}» нет`);
  }

  return section.rows.filter((row) => row.kind === 'row').map((row) => row.cells);
};

const sectionNotes = (report: ReportResult, title: string): string[] =>
  report.sections.find((section) => section.title === title)?.notes ?? [];

/** Показатели «Цены балла» — подпись → значение. */
const pointPrice = async (period: PeriodReportParams): Promise<Record<string, ReportCell>> => {
  const report = await readPointsEconomyReport({ from: period.from, to: period.to });

  return Object.fromEntries(
    sectionRows(report, 'Цена балла').map((cells) => [String(cells.indicator), cells.value ?? null]),
  );
};

const COST_INDICATOR = 'Себестоимость этого товара, сум';
const UNPRICED_INDICATOR = 'Позиций без себестоимости';

describe('себестоимость в отчётах — по снимку', () => {
  afterEach(async () => {
    await cleanupTestData();
    await cleanupTestEmployees();
  });
  afterAll(async () => {
    await disconnectDatabase();
    await disconnectQueues();
  });

  it('правка цены каталога после продажи и выдачи отчётов не меняет', async () => {
    const context = await scenario();

    await sell(context, 2);
    await giveOutPrize(context);

    const priceBefore = await pointPrice(context.period);

    await setTestProductCost(context.productId, 99_000);
    await setTestProductCost(context.prizeId, 77_000);

    const sales = await readSalesReport(context.period);

    expect(sectionRows(sales, 'За баллы')).toEqual([
      expect.objectContaining({ quantity: 2, points: 80, cost: 64_000, note: '' }),
    ]);
    expect(sectionNotes(sales, 'За баллы')).toEqual([COST_NOTE]);

    const rewards = await readRewardsReport(context.period);

    expect(sectionRows(rewards, 'Выдано')).toEqual([
      expect.objectContaining({ quantity: 1, cost: 4_000, note: '' }),
    ]);
    expect(sectionNotes(rewards, 'Выдано')).toEqual([COST_NOTE]);

    const priceAfter = await pointPrice(context.period);

    expect(priceAfter).toEqual(priceBefore);
    // Наша продажа в цене балла есть: без неё себестоимость была бы на 64 000 меньше.
    expect(Number(priceAfter[COST_INDICATOR])).toBeGreaterThanOrEqual(64_000);
  });

  it('пустой снимок хоть у одной строки группы — себестоимости у группы нет, и пометка', async () => {
    const context = await scenario();

    const first = await sell(context, 1);
    await sell(context, 1);
    const firstPrize = await giveOutPrize(context);
    await giveOutPrize(context);

    const priceBefore = await pointPrice(context.period);

    await clearTestOrderItemCost(first);
    await clearTestRewardCost(firstPrize);

    const sales = await readSalesReport(context.period);

    // Два заказа одного товара — одна строка: частичная сумма занизила бы себестоимость.
    expect(sectionRows(sales, 'За баллы')).toEqual([
      expect.objectContaining({ quantity: 2, points: 80, cost: null, note: NO_COST_NOTE }),
    ]);
    expect(sectionNotes(sales, 'За баллы')).toEqual([missingCostNote(1), COST_NOTE]);

    const rewards = await readRewardsReport(context.period);

    expect(sectionRows(rewards, 'Выдано')).toEqual([
      expect.objectContaining({ quantity: 2, cost: null, note: NO_COST_NOTE }),
    ]);
    expect(sectionNotes(rewards, 'Выдано')).toEqual([missingCostNote(1), COST_NOTE]);

    // Группа выпала из цены балла целиком — и себестоимостью, и баллами.
    const priceAfter = await pointPrice(context.period);

    expect(priceAfter[COST_INDICATOR]).toBe(Number(priceBefore[COST_INDICATOR]) - 64_000);
    expect(priceAfter[UNPRICED_INDICATOR]).toBe(Number(priceBefore[UNPRICED_INDICATOR]) + 1);
  });
});
