import { db } from '#server/db';

/**
 * Заказы истории, порции сбора и уборка таблиц метрик для теста пересчёта (issue #371).
 *
 * Таблицы метрик целиком производные: пересчёт стирает их и пишет заново, поэтому уборка
 * стирает их целиком тоже — иначе строки с людьми тестов держали бы внешний ключ, и уборка
 * людей (`cleanupTestData`) падала бы на нём.
 */

export type TestHistoryOrderInput = {
  orderId: string;
  profileId: string;
  status: string;
  endedAt: Date | null;
};

export const insertTestHistoryOrder = async (input: TestHistoryOrderInput): Promise<void> => {
  await db.fleetOrderHistory.create({
    data: {
      orderId: input.orderId,
      profileId: input.profileId,
      status: input.status,
      category: 'econom',
      paymentMethod: 'cash',
      bookedAt: input.endedAt ?? new Date('2025-11-01T00:00:00Z'),
      endedAt: input.endedAt,
      price: 25000,
    },
  });
};

/** Порция сбора истории `parkDay` (сутки UTC): закрытая или прерванная. */
export const upsertTestHistoryDay = async (parkDay: string, closed: boolean): Promise<void> => {
  const day = new Date(`${parkDay}T00:00:00Z`);
  const finishedAt = closed ? new Date() : null;

  await db.fleetOrderHistoryDay.upsert({
    where: { parkDay: day },
    create: {
      parkDay: day,
      orders: 0,
      complete: 0,
      malformed: 0,
      pages: 1,
      rateLimited: 0,
      startedAt: new Date(),
      finishedAt,
    },
    update: { finishedAt },
  });
};

export type TestPersonDay = { day: string; personId: string; trips: number };

/** Строки таблицы метрик этих людей, по порядку суток. */
export const readTestPersonDays = async (personIds: readonly string[]): Promise<TestPersonDay[]> =>
  db.$queryRaw<TestPersonDay[]>`
    SELECT to_char("day", 'YYYY-MM-DD') AS "day", "person_id" AS "personId", "trips"
      FROM xb.metric_person_days
     WHERE "person_id" = ANY(${[...personIds]}::uuid[])
     ORDER BY "day", "person_id"
  `;

export const countMetricPersonDays = async (): Promise<number> => {
  const rows = await db.$queryRaw<{ total: number }[]>`
    SELECT count(*)::int AS "total" FROM xb.metric_person_days
  `;

  return rows[0]?.total ?? 0;
};

export const cleanupTestMetrics = async (
  historyOrderIds: readonly string[],
  historyDays: readonly string[],
): Promise<void> => {
  await db.$executeRaw`DELETE FROM xb.metric_person_days`;
  await db.$executeRaw`DELETE FROM xb.metric_recompute_runs`;
  await db.$executeRaw`
    DELETE FROM xb.fleet_order_history WHERE "order_id" = ANY(${[...historyOrderIds]}::text[])
  `;
  await db.$executeRaw`
    DELETE FROM xb.fleet_order_history_days WHERE "park_day" = ANY(${[...historyDays]}::date[])
  `;
};
