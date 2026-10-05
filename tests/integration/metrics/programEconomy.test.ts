import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '#server/db';
import { placeDeskOrder } from '#server/services/orders/placeDeskOrder';
import { recomputePersonDays } from '#server/services/metrics/recomputePersonDays';
import { readOutsideProgram } from '#server/services/metrics/readOutsideProgram';
import { readPointsWeekly } from '#server/services/metrics/readPointsWeekly';
import { readProgramEconomy } from '#server/services/metrics/readProgramEconomy';
import { ensureDriverAccount } from '#server/services/points/ensureDriverAccount';
import { getSystemAccount } from '#server/services/points/getSystemAccount';
import {
  buildManualIdempotencyKey,
  buildMergeIdempotencyKey,
  buildOpeningIdempotencyKey,
  buildOrderRefundIdempotencyKey,
  buildOrderSpendIdempotencyKey,
  buildTripIdempotencyKey,
  buildWelcomeIdempotencyKey,
  type IdempotencyKey,
} from '#server/services/points/idempotencyKey';
import { transferPoints } from '#server/services/points/transfer';
import { receiveStock } from '#server/services/stock/receiveStock';
import type { PointReason } from '#server/generated/prisma/enums';
import type { DashboardOutsideProgram, DashboardPointsWeek, DashboardProgramEconomy } from '#shared/types/dashboard';
import {
  cleanupTestData,
  clearTestOrderItemCost,
  createTestOffice,
  createTestPerson,
  createTestProduct,
  createTestTrip,
  disconnectDatabase,
  setTestProductCost,
  type TestPerson,
} from '../support/database';
import { cleanupTestEmployees, createTestEmployee } from '../support/employees';
import { backdateTestOrderIssue, cleanupTestLinks, cleanupTestMetrics, linkTestPersonAt } from '../support/metrics';
import { grantPoints } from '../support/points';
import { disconnectQueues } from '../support/queues';

/**
 * Баллы и программа на вкладке «Глубина» против настоящей базы (issue #373).
 *
 * Запросы сырые — третье исключение правила тестов (docs/infra.md → «Тесты»): миграция журнала,
 * заказов или привязок сломала бы их молча. Тест гоняет их через сервисы, которыми их зовёт ручка.
 *
 * Месяц теста — декабрь 2025: внутри окна метрик и далеко от «сейчас», которым пишут переводы
 * остальные тесты. Журнал и таблица метрик общие на базу, поэтому выдача, долг и «вне программы»
 * сверяются приращением к замеру до сценария, а не числом. Цена балла — отношение, приращения
 * у неё нет: она сверяется числом, и замер до сценария обязан показать, что заказов в месяце нет.
 */

const NOW = new Date('2026-10-05T12:00:00Z');

const DECEMBER = { from: '2025-12-01', to: '2025-12-31', days: 31, partial: false };

/** 11:00 по Ташкенту дня `day` — далеко от границы суток. */
const at = (day: string): Date => new Date(`${day}T06:00:00Z`);

type Snapshot = {
  economy: DashboardProgramEconomy;
  weeks: DashboardPointsWeek[];
  outside: DashboardOutsideProgram;
};

const snapshot = async (): Promise<Snapshot> => {
  await recomputePersonDays(NOW);

  return {
    economy: await readProgramEconomy(DECEMBER),
    weeks: await readPointsWeekly(DECEMBER.to, NOW),
    outside: await readOutsideProgram(DECEMBER),
  };
};

const weekDelta = (before: Snapshot, after: Snapshot, weekStart: string): { issued: number; spent: number } => {
  const was = before.weeks.find((week) => week.weekStart === weekStart);
  const now = after.weeks.find((week) => week.weekStart === weekStart);

  return { issued: (now?.issued ?? 0) - (was?.issued ?? 0), spent: (now?.spent ?? 0) - (was?.spent ?? 0) };
};

describe('экономика программы и вне программы', () => {
  let before: Snapshot;
  let after: Snapshot;
  let driver: TestPerson;
  let productId: string;

  const transfer = async (input: {
    reason: PointReason;
    key: IdempotencyKey;
    amount: number;
    from: string;
    to: string;
    occurredAt: Date;
    allowNegative?: boolean;
  }): Promise<void> => {
    await transferPoints({
      reason: input.reason,
      idempotencyKey: input.key,
      amount: input.amount,
      fromAccountId: input.from,
      toAccountId: input.to,
      occurredAt: input.occurredAt,
      allowNegative: input.allowNegative,
    });
  };

  beforeAll(async () => {
    before = await snapshot();

    const emission = (await getSystemAccount('emission')).id;
    const redemption = (await getSystemAccount('redemption')).id;

    driver = await createTestPerson({ inProgram: true });
    const twin = await createTestPerson({ inProgram: true });
    const debtor = await createTestPerson({ inProgram: true });
    const demo = await createTestPerson({ inProgram: true });
    await db.person.update({ where: { id: demo.personId }, data: { isDemo: true } });

    const driverAccount = (await ensureDriverAccount(driver.personId)).id;
    const twinAccount = (await ensureDriverAccount(twin.personId)).id;
    const debtorAccount = (await ensureDriverAccount(debtor.personId)).id;
    const demoAccount = (await ensureDriverAccount(demo.personId)).id;

    // Неделя 01.12: поездка, приветственный бонус и ручное начисление — выдача.
    await transfer({ reason: 'trip', key: buildTripIdempotencyKey(`test-depth-${randomUUID()}`), amount: 100, from: emission, to: driverAccount, occurredAt: at('2025-12-02') });
    await transfer({ reason: 'welcome', key: buildWelcomeIdempotencyKey(driver.personId), amount: 50, from: emission, to: driverAccount, occurredAt: at('2025-12-03') });
    await transfer({ reason: 'manual', key: buildManualIdempotencyKey(randomUUID()), amount: 30, from: emission, to: driverAccount, occurredAt: at('2025-12-05') });

    // Перенос баланса и склейка двойников — не выдача, хотя баллы ложатся на счёт водителя.
    await transfer({ reason: 'opening', key: buildOpeningIdempotencyKey(twin.personId), amount: 500, from: emission, to: twinAccount, occurredAt: at('2025-12-02') });
    await transfer({ reason: 'merge', key: buildMergeIdempotencyKey(twin.personId), amount: 200, from: twinAccount, to: driverAccount, occurredAt: at('2025-12-04') });

    // Долг из старой базы: перенос уводит счёт в минус.
    await transfer({ reason: 'opening', key: buildOpeningIdempotencyKey(debtor.personId), amount: 300, from: debtorAccount, to: emission, occurredAt: at('2025-12-02'), allowNegative: true });

    // Неделя 08.12: ручное списание вычитается из выдачи, заказ — трата.
    await transfer({ reason: 'manual', key: buildManualIdempotencyKey(randomUUID()), amount: 20, from: driverAccount, to: emission, occurredAt: at('2025-12-09') });
    const spentOrderId = randomUUID();
    await transfer({ reason: 'order_spend', key: buildOrderSpendIdempotencyKey(spentOrderId), amount: 60, from: driverAccount, to: redemption, occurredAt: at('2025-12-10') });

    // Неделя 15.12: возврат за тот заказ — вычитается из траты своей недели, а не недели заказа.
    await transfer({ reason: 'order_refund', key: buildOrderRefundIdempotencyKey(spentOrderId), amount: 25, from: redemption, to: driverAccount, occurredAt: at('2025-12-16') });

    // 00:30 первого января по Ташкенту — уже после конца декабря.
    await transfer({ reason: 'trip', key: buildTripIdempotencyKey(`test-depth-${randomUUID()}`), amount: 40, from: emission, to: driverAccount, occurredAt: new Date('2025-12-31T19:30:00Z') });

    // Демо-водитель не входит ни в выдачу, ни в долг.
    await transfer({ reason: 'trip', key: buildTripIdempotencyKey(`test-depth-${randomUUID()}`), amount: 70, from: emission, to: demoAccount, occurredAt: at('2025-12-02') });

    // Заказы у стойки за баллы: два со снимком себестоимости, один без него.
    const officeId = await createTestOffice();
    const { employeeId } = await createTestEmployee({ role: 'owner' });
    const owner = { employeeId, role: 'owner' as const, isDemo: false };
    productId = await createTestProduct({ pricePoints: 40 });
    const cheapId = await createTestProduct({ pricePoints: 10 });
    await setTestProductCost(cheapId, 3_000);
    await receiveStock({ officeId, productId, quantity: 10, employeeId });
    await receiveStock({ officeId, productId: cheapId, quantity: 10, employeeId });
    await grantPoints(driver.personId, 1_000);

    const sell = async (sold: string, quantity: number): Promise<string> =>
      (
        await placeDeskOrder(owner, {
          officeId,
          personId: driver.personId,
          payment: 'points',
          items: [{ productId: sold, quantity }],
          actor: 'web',
        })
      ).orderId;

    const pricedOrders = [await sell(productId, 2), await sell(cheapId, 3)];
    const unpricedOrder = await sell(productId, 1);
    await clearTestOrderItemCost(unpricedOrder);

    for (const orderId of [...pricedOrders, unpricedOrder]) {
      await backdateTestOrderIssue(orderId, at('2025-12-12'));
    }

    // Вне программы: поездки в декабре у троих участников таблицы и демо.
    const stranger = await createTestPerson({ inProgram: false });
    const lapsed = await createTestPerson({ inProgram: false });
    const late = await createTestPerson({ inProgram: false });
    const demoDriver = await createTestPerson({ inProgram: false });
    await db.person.update({ where: { id: demoDriver.personId }, data: { isDemo: true } });

    // Привязал и отвязался до декабря — всё равно участник.
    await linkTestPersonAt(lapsed.personId, at('2025-11-01'), at('2025-11-20'));
    // Привязал после декабря — за декабрь вне программы.
    await linkTestPersonAt(late.personId, at('2026-01-10'));

    const trips: [TestPerson, string][] = [
      [stranger, '2025-12-05'],
      [stranger, '2025-12-06'],
      [lapsed, '2025-12-05'],
      [late, '2025-12-07'],
      [demoDriver, '2025-12-07'],
    ];

    for (const [person, day] of trips) {
      await createTestTrip({
        profileId: person.profileId,
        tripOrderId: `test-depth-trip-${randomUUID()}`,
        status: 'complete',
        endedAt: at(day),
      });
    }

    after = await snapshot();
  });

  afterAll(async () => {
    await cleanupTestMetrics([], []);
    await cleanupTestLinks();
    await cleanupTestData();
    await cleanupTestEmployees();
    await disconnectQueues();
    await disconnectDatabase();
  });

  it('выдано — без переноса, склейки и возврата; ручное списание вычитается', () => {
    // Поездка 100 + бонус 50 + ручное 30 − ручное списание 20.
    expect(after.economy.issued - before.economy.issued).toBe(160);
  });

  it('потрачено — заказ за вычетом возврата', () => {
    expect(after.economy.spent - before.economy.spent).toBe(35);
  });

  it('возврат вычитается из потраченного в своей неделе, списание — в своей', () => {
    expect(weekDelta(before, after, '2025-12-01')).toEqual({ issued: 180, spent: 0 });
    expect(weekDelta(before, after, '2025-12-08')).toEqual({ issued: -20, spent: 60 });
    expect(weekDelta(before, after, '2025-12-15')).toEqual({ issued: 0, spent: -25 });
  });

  it('недели — с понедельника, последняя — неделя конца периода, прошедшие не идут', () => {
    const last = after.weeks.at(-1);

    expect(last?.weekStart).toBe('2025-12-29');
    expect(after.weeks.length).toBeLessThanOrEqual(12);
    expect(after.weeks.every((week) => !week.current)).toBe(true);
  });

  it('цена балла — по снимку себестоимости; строка без снимка не входит и считается отдельно', async () => {
    // Замер до сценария: чужих выданных заказов к концу декабря нет — цена считается только по этим.
    expect(before.economy.pointCostOrders).toBe(0);

    // (2 × 32 000 + 3 × 3 000) ÷ (2 × 40 + 3 × 10) = 73 000 ÷ 110 ≈ 663,6.
    expect(after.economy.pointCost).toBe(664);
    expect(after.economy.pointCostOrders).toBe(2);
    expect(after.economy.pointCostUnpricedLines).toBe(1);

    // Правка каталога цену балла задним числом не двигает.
    await setTestProductCost(productId, 1);
    expect((await readProgramEconomy(DECEMBER)).pointCost).toBe(664);
  });

  it('долг — плюсовые балансы на момент: минусовый счёт его не уменьшает, позднего перевода в нём нет', () => {
    // Водитель: 100 + 50 + 30 + 200 − 20 − 60 + 25 = 325; двойник: 500 − 200 = 300; должник −300 не входит.
    expect(after.economy.debtPoints - before.economy.debtPoints).toBe(625);
    expect(after.economy.debtPointsChange - before.economy.debtPointsChange).toBe(625);
    expect(after.economy.debtSum).toBe(after.economy.debtPoints * 664);
  });

  it('вне программы: закрытая привязка — участник, привязавший позже — вне программы, демо нет', () => {
    expect(after.outside.drivers - before.outside.drivers).toBe(2);
    expect(after.outside.driversOnLine - before.outside.driversOnLine).toBe(3);
    expect(after.outside.trips - before.outside.trips).toBe(3);
    expect(after.outside.allTrips - before.outside.allTrips).toBe(4);
  });
});
