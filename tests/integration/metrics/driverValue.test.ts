import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { moneyCoverageByMonth, withMoneyCoverage } from '#server/services/metrics/moneyCoverage';
import { wholeMonthPeriod } from '#server/services/metrics/monthPeriod';
import { readDriverValue } from '#server/services/metrics/readDriverValue';
import { recomputeMoneyDays } from '#server/services/metrics/recomputeMoneyDays';
import type { DashboardDriverValue } from '#shared/types/dashboard';
import { cleanupTestData, createTestPerson, disconnectDatabase, type TestPerson } from '../support/database';
import {
  cleanupTestMoney,
  countTestPersonMonths,
  insertTestMoneyRun,
  insertTestOrderTransaction,
  insertTestPersonMonths,
  markTestPersonDemo,
  readLastPersonMonthRows,
  readTestPersonMonths,
  setTestHireDate,
  upsertTestTransactionDay,
  type TestPersonMonth,
} from '../support/metrics';

/**
 * Цена водителя за год против настоящей базы (issue #442).
 *
 * Таблицу людей по месяцам пишет один сырой запрос в прогоне денег, плитку читают сырые запросы
 * с `ntile` и `percentile_cont`: миграция или правка любого из них ломает цифры молча, типы
 * расхождения со схемой не ловят (docs/infra.md → «Тесты», третье исключение). Пересчёт гоняется
 * сервисом, которым его зовут очередь и разовый пересчёт; плитка — сервисом ручки «Глубины».
 */

const ORDER_PREFIX = `test-driver-value-${process.pid}`;

let nextOrder = 0;

const nextOrderId = (): string => {
  nextOrder += 1;

  return `${ORDER_PREFIX}-${nextOrder}`;
};

/** Заказ: комиссия парка строкой или несколькими и оплата по тому же `order_id`. */
const insertOrder = async (
  profileId: string | null,
  fees: readonly { at: string; amount: string }[],
  payments: readonly { at: string; categoryId: string; amount: string }[],
): Promise<void> => {
  const orderId = nextOrderId();

  for (const fee of fees) {
    await insertTestOrderTransaction({
      profileId,
      categoryId: 'partner_ride_fee',
      eventAt: new Date(fee.at),
      amount: fee.amount,
      orderId,
    });
  }

  for (const payment of payments) {
    await insertTestOrderTransaction({
      profileId,
      categoryId: payment.categoryId,
      eventAt: new Date(payment.at),
      amount: payment.amount,
      orderId,
    });
  }
};

describe('пересчёт денег людей по месяцам', () => {
  /** «Сейчас» пересчёта: окно денег — по 2025-11-04 включительно. */
  const NOW = new Date('2025-11-05T12:00:00Z');

  let rider: TestPerson;
  let noHire: TestPerson;
  let demo: TestPerson;

  beforeAll(async () => {
    await cleanupTestMoney([]);

    rider = await createTestPerson({ inProgram: false });
    noHire = await createTestPerson({ inProgram: false });
    demo = await createTestPerson({ inProgram: false });

    await setTestHireDate(rider.profileId, '2025-10-05');
    await setTestHireDate(noHire.profileId, null);
    await setTestHireDate(demo.profileId, '2025-10-05');
    await markTestPersonDemo(demo.personId);

    // Комиссия в 19:30Z 31.10 — 00:30 1 ноября по Ташкенту: месяц — ноябрь. Оплата пришла
    // в 23:00 31 октября по Ташкенту и уходит за комиссией в ноябрь. Сутки 27 с найма — вне окна.
    await insertOrder(
      rider.profileId,
      [{ at: '2025-10-31T19:30:00Z', amount: '-100' }],
      [{ at: '2025-10-31T18:00:00Z', categoryId: 'card', amount: '3000' }],
    );
    // Сутки найма — сутки 0, в окне ставки новичка.
    await insertOrder(
      rider.profileId,
      [{ at: '2025-10-05T10:00:00Z', amount: '-40' }],
      [{ at: '2025-10-05T10:00:00Z', categoryId: 'cash_collected', amount: '2000' }],
    );
    // 23:59:59 18 октября по Ташкенту — сутки 13, последние в окне.
    await insertOrder(
      rider.profileId,
      [{ at: '2025-10-18T18:59:59Z', amount: '-30' }],
      [{ at: '2025-10-18T18:59:59Z', categoryId: 'card', amount: '1500' }],
    );
    // 00:00 19 октября по Ташкенту — сутки 14, уже вне окна.
    await insertOrder(
      rider.profileId,
      [{ at: '2025-10-18T19:00:00Z', amount: '-80' }],
      [{ at: '2025-10-18T19:00:00Z', categoryId: 'cash_collected', amount: '1700' }],
    );
    // Две строки комиссии у одного заказа: оплата считается один раз, строк — две. Чаевые не входят.
    await insertOrder(
      rider.profileId,
      [
        { at: '2025-10-20T08:00:00Z', amount: '-60' },
        { at: '2025-10-20T09:00:00Z', amount: '-20' },
      ],
      [
        { at: '2025-10-20T08:00:00Z', categoryId: 'card', amount: '1600' },
        { at: '2025-10-20T08:00:00Z', categoryId: 'tips', amount: '500' },
      ],
    );
    // Без даты найма — вне окна ставки новичка.
    await insertOrder(
      noHire.profileId,
      [{ at: '2025-10-10T08:00:00Z', amount: '-50' }],
      [{ at: '2025-10-10T08:00:00Z', categoryId: 'card', amount: '1000' }],
    );
    // Демо не входит; профиль вне реестра человека не даёт.
    await insertOrder(
      demo.profileId,
      [{ at: '2025-10-10T08:00:00Z', amount: '-70' }],
      [{ at: '2025-10-10T08:00:00Z', categoryId: 'card', amount: '1400' }],
    );
    await insertOrder(
      'test-driver-value-unknown-profile',
      [{ at: '2025-10-10T08:00:00Z', amount: '-90' }],
      [{ at: '2025-10-10T08:00:00Z', categoryId: 'card', amount: '1800' }],
    );

    await recomputeMoneyDays(NOW);
  });

  afterAll(async () => {
    await cleanupTestMoney([]);
    await cleanupTestData();
  });

  it('месяц по Ташкенту, оплата — в месяц комиссии, окно новичка — сутки 0–13 с найма', async () => {
    expect(await readTestPersonMonths([rider.personId])).toEqual([
      {
        month: '2025-10-01',
        personId: rider.personId,
        orders: 5,
        fee: '230.0000',
        payment: '6800.0000',
        feeNewcomerRate: '70.0000',
        paymentNewcomerRate: '3500.0000',
      },
      {
        month: '2025-11-01',
        personId: rider.personId,
        orders: 1,
        fee: '100.0000',
        payment: '3000.0000',
        feeNewcomerRate: '0.0000',
        paymentNewcomerRate: '0.0000',
      },
    ]);
  });

  it('без даты найма — вне окна; демо и профиль вне реестра не входят', async () => {
    expect(await readTestPersonMonths([noHire.personId, demo.personId])).toEqual([
      {
        month: '2025-10-01',
        personId: noHire.personId,
        orders: 1,
        fee: '50.0000',
        payment: '1000.0000',
        feeNewcomerRate: '0.0000',
        paymentNewcomerRate: '0.0000',
      },
    ]);
  });

  it('прогон пишет число строк таблицы', async () => {
    expect(await readLastPersonMonthRows()).toBe(await countTestPersonMonths());
  });
});

describe('покрытие первых суток денег', () => {
  // Порция 2024-03-31 по UTC не собрана: первые сутки денег плитке хватает своей порции,
  // «Деньгам» — нет. Вторые сутки по-прежнему требуют обеих.
  const DAYS = ['2024-04-01', '2024-04-02'];

  beforeAll(async () => {
    await cleanupTestMoney(DAYS);
    for (const day of DAYS) {
      await upsertTestTransactionDay(day, 'closed');
    }
  });

  afterAll(async () => {
    await cleanupTestMoney(DAYS);
  });

  it('плитке — сутки 1 и 2 апреля 2024, «Деньгам» — только 2 апреля', async () => {
    const [april] = await moneyCoverageByMonth('2024-04', '2024-04', '2024-04-30');
    const money = await withMoneyCoverage(wholeMonthPeriod('2024-04'), '2024-04-30');

    expect(april?.coveredDays).toBe(2);
    expect(money.coveredDays).toBe(1);
  });
});

describe('расчёт плитки «Цена водителя за год»', () => {
  /**
   * Плитка за ноябрь 2029: наборы «за год» — декабрь 2027 … ноябрь 2028, «за два года» —
   * декабрь 2026 … ноябрь 2027. Все месяцы — после `TRANSACTIONS_COMPLETE_FROM`, и покрытие
   * задаёт только последний прогон денег.
   *
   * - набор ноября 2028: лидер `leader` (50 заказов) и четверо остальных — `others[0..3]`
   *   (40, 30, 20, 10); пятёрка `ntile(5)` даёт лидером одного
   * - `leader` в декабре 2028 — оплата 1 000, в ноябре 2029 (через 12 месяцев) — 1 000, из них
   *   200 в окне новичка: ездит через год
   * - `others[0]` в январе 2029 — 2 000, `others[1]` в декабре 2028 — 800; двое ушли и дают нули
   * - `veteran` — набор ноября 2027 «за два года», один в месяце, лидер; в октябре 2029 — 1 000
   *
   * Ставки ноября 2029: основная = (44 − 4) ÷ (1 000 − 200) = 5 %, новичка = 4 ÷ 200 = 2 %.
   * В октябре 2029 оплаты новичков нет — ставка новичка равна основной.
   */
  const NOW = new Date('2029-12-15T12:00:00Z');

  let leader: TestPerson;
  let others: TestPerson[];
  let veteran: TestPerson;

  const row = (
    month: string,
    person: TestPerson,
    orders: number,
    money: { fee?: string; payment?: string; feeNewcomerRate?: string; paymentNewcomerRate?: string } = {},
  ): TestPersonMonth => ({
    month,
    personId: person.personId,
    orders,
    fee: money.fee ?? '0',
    payment: money.payment ?? '0',
    feeNewcomerRate: money.feeNewcomerRate ?? '0',
    paymentNewcomerRate: money.paymentNewcomerRate ?? '0',
  });

  beforeAll(async () => {
    await cleanupTestMoney([]);

    leader = await createTestPerson({ inProgram: false });
    others = [];
    for (let index = 0; index < 4; index += 1) {
      others.push(await createTestPerson({ inProgram: false }));
    }
    veteran = await createTestPerson({ inProgram: false });

    const [first, second, third, fourth] = others as [TestPerson, TestPerson, TestPerson, TestPerson];

    await insertTestPersonMonths([
      row('2028-11-01', leader, 50),
      row('2028-11-01', first, 40),
      row('2028-11-01', second, 30),
      row('2028-11-01', third, 20),
      row('2028-11-01', fourth, 10),
      row('2028-12-01', leader, 20, { payment: '1000' }),
      row('2028-12-01', second, 5, { payment: '800' }),
      row('2029-01-01', first, 30, { payment: '2000' }),
      row('2029-11-01', leader, 30, {
        fee: '44',
        payment: '1000',
        feeNewcomerRate: '4',
        paymentNewcomerRate: '200',
      }),
      row('2027-11-01', veteran, 10),
      row('2029-10-01', veteran, 10, { fee: '50', payment: '1000' }),
    ]);
  });

  afterAll(async () => {
    await cleanupTestMoney([]);
    await cleanupTestData();
    await disconnectDatabase();
  });

  it('собраны не все сутки — цифр нет, покрытие говорит, сколько собрано', async () => {
    await insertTestMoneyRun('2029-11-29', new Date('2029-11-30T01:00:00Z'));

    const value = await readDriverValue('2029-11', NOW);

    expect(value.rates).toEqual({ main: null, newcomer: null });
    expect(value.leader.value12).toBeNull();
    expect(value.newcomer.value12).toBeNull();
    expect(value.coverage.filter((period) => period.coveredDays < period.days)).toEqual([
      { from: '2029-11-01', to: '2029-11-30', days: 30, partial: false, coveredDays: 29 },
    ]);
  });

  describe('все сутки собраны', () => {
    let closed: DashboardDriverValue;

    beforeAll(async () => {
      await insertTestMoneyRun('2029-12-14', new Date('2029-12-15T01:00:00Z'));
      closed = await readDriverValue('2029-11', NOW);
    });

    it('ставки — месяца плитки, наборы — последние 12 с прошедшим годом', () => {
      expect(closed.month).toBe('2029-11');
      expect(closed.ongoing).toBe(false);
      expect(closed.cohortsFrom).toBe('2027-12');
      expect(closed.cohortsTo).toBe('2028-11');
      expect(closed.rates.main).toBeCloseTo(0.05, 10);
      expect(closed.rates.newcomer).toBeCloseTo(0.02, 10);
    });

    it('лидер — верхние 20 % по заказам, ушедшие дают нули', () => {
      // Лидер: 0,05 × 1 000 + (0,05 × 800 + 0,02 × 200) = 94. Остальные: (100 + 40 + 0 + 0) ÷ 4.
      expect(closed.leader).toEqual({ people: 1, value12: 94, value24: 50, ridingAfterYearPercent: 100 });
      expect(closed.others).toEqual({ people: 4, value12: 35, value24: null, ridingAfterYearPercent: 0 });
    });

    it('новичок — среднее и медиана за 12 месяцев с месяца прихода, доросшие до лидера', () => {
      // Цены: 50, 100, 40, 0, 0. Лидеры: `leader` — в ноябре 2028, `others[0]` — один в январе 2029.
      expect(closed.newcomer).toEqual({
        people: 5,
        value12: 38,
        median12: 40,
        ridingAfterYearPercent: 0,
        becameLeaderPercent: 40,
        monthsToLeader: 1,
      });
    });

    it('идущий месяц показывает последний закрытый', async () => {
      const ongoing = await readDriverValue('2029-12', NOW);

      expect(ongoing.ongoing).toBe(true);
      expect({ ...ongoing, ongoing: false }).toEqual(closed);
    });

    it('оплаты новичков в месяце нет — ставка новичка равна основной', async () => {
      const october = await readDriverValue('2029-10', NOW);

      expect(october.rates.main).toBeCloseTo(0.05, 10);
      expect(october.rates.newcomer).toBe(october.rates.main);
    });
  });
});
