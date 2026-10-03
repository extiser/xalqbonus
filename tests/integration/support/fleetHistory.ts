import { db } from '#server/db';

/**
 * Чтение и уборка истории заказов парка для тестов сборщика (issue #343).
 *
 * Уборка — по суткам, которые тест обходит: строки журнала по `park_day`, заказы — по окну
 * `ended_at` этих суток. Сутки тесты берут заведомо вне глубины Fleet API, где настоящих
 * заказов в базе быть не может, и уборка там ничего чужого не заденет. Идёт и до тестов:
 * прогон, упавший посреди файла, оставил бы журнал суток, с которого следующий продолжил бы,
 * а не начал.
 */

const DAY_MS = 86_400_000;

/** Строка истории в той форме, в которой её положил репозиторий. */
export type HistoryOrderSnapshot = {
  orderId: string;
  profileId: string;
  status: string;
  category: string;
  paymentMethod: string;
  workRuleId: string | null;
  bookedAt: Date;
  endedAt: Date | null;
  /** `numeric` строкой: так его видно без перевода во float. */
  price: string;
  carCallsign: string | null;
};

/** Строки истории этих заказов, по порядку идентификатора. */
export const readTestHistoryOrders = async (orderIds: string[]): Promise<HistoryOrderSnapshot[]> =>
  db.$queryRaw<HistoryOrderSnapshot[]>`
    SELECT "order_id"       AS "orderId",
           "profile_id"     AS "profileId",
           "status",
           "category",
           "payment_method" AS "paymentMethod",
           "work_rule_id"   AS "workRuleId",
           "booked_at"      AS "bookedAt",
           "ended_at"       AS "endedAt",
           "price"::text    AS "price",
           "car_callsign"   AS "carCallsign"
      FROM xb.fleet_order_history
     WHERE "order_id" = ANY(${orderIds}::text[])
     ORDER BY "order_id"
  `;

/** Сколько строк истории легло в окно суток — с числом заказов журнала это и сверяется. */
export const countTestHistoryOrders = async (parkDay: string): Promise<number> => {
  const from = new Date(`${parkDay}T00:00:00Z`);
  const to = new Date(from.getTime() + DAY_MS);
  const rows = await db.$queryRaw<{ total: number }[]>`
    SELECT count(*)::int AS "total"
      FROM xb.fleet_order_history
     WHERE "ended_at" >= ${from}::timestamptz AND "ended_at" < ${to}::timestamptz
  `;

  return rows[0]?.total ?? 0;
};

export const cleanupTestHistoryDays = async (parkDays: readonly string[]): Promise<void> => {
  for (const parkDay of parkDays) {
    const from = new Date(`${parkDay}T00:00:00Z`);
    const to = new Date(from.getTime() + DAY_MS);

    await db.$executeRaw`
      DELETE FROM xb.fleet_order_history
       WHERE "ended_at" >= ${from}::timestamptz AND "ended_at" < ${to}::timestamptz
    `;
    await db.$executeRaw`
      DELETE FROM xb.fleet_order_history_days WHERE "park_day" = ${parkDay}::date
    `;
  }
};
