import { db } from '#server/db';

/**
 * Чтение и уборка транзакций парка для тестов сборщика (issue #358).
 *
 * Уборка — по суткам, которые тест обходит: строки журнала по `park_day`, транзакции — по окну
 * `event_at` этих суток. Сутки тесты берут заведомо вне глубины Fleet API, где настоящих
 * транзакций в базе быть не может. Идёт и до тестов: прогон, упавший посреди файла, оставил бы
 * журнал суток, с которого следующий продолжил бы, а не начал.
 */

const DAY_MS = 86_400_000;

/** Строка транзакции в той форме, в которой её положил репозиторий. */
export type TransactionSnapshot = {
  id: string;
  eventAt: Date;
  categoryId: string;
  /** `numeric` строкой: так его видно без перевода во float. */
  amount: string;
  currencyCode: string | null;
  driverProfileId: string | null;
  orderId: string | null;
  externalEventId: string | null;
  description: string | null;
  createdBy: string | null;
  createdByDispatcher: string | null;
};

/** Строки этих транзакций, по порядку идентификатора. */
export const readTestTransactions = async (ids: string[]): Promise<TransactionSnapshot[]> =>
  db.$queryRaw<TransactionSnapshot[]>`
    SELECT "id",
           "event_at"              AS "eventAt",
           "category_id"           AS "categoryId",
           "amount"::text          AS "amount",
           "currency_code"         AS "currencyCode",
           "driver_profile_id"     AS "driverProfileId",
           "order_id"              AS "orderId",
           "external_event_id"     AS "externalEventId",
           "description",
           "created_by"            AS "createdBy",
           "created_by_dispatcher" AS "createdByDispatcher"
      FROM xb.fleet_transactions
     WHERE "id" = ANY(${ids}::text[])
     ORDER BY "id"
  `;

/** Сколько транзакций легло в окно суток — с числом транзакций журнала это и сверяется. */
export const countTestTransactions = async (parkDay: string): Promise<number> => {
  const from = new Date(`${parkDay}T00:00:00Z`);
  const to = new Date(from.getTime() + DAY_MS);
  const rows = await db.$queryRaw<{ total: number }[]>`
    SELECT count(*)::int AS "total"
      FROM xb.fleet_transactions
     WHERE "event_at" >= ${from}::timestamptz AND "event_at" < ${to}::timestamptz
  `;

  return rows[0]?.total ?? 0;
};

export const cleanupTestTransactionDays = async (parkDays: readonly string[]): Promise<void> => {
  for (const parkDay of parkDays) {
    const from = new Date(`${parkDay}T00:00:00Z`);
    const to = new Date(from.getTime() + DAY_MS);

    await db.$executeRaw`
      DELETE FROM xb.fleet_transactions
       WHERE "event_at" >= ${from}::timestamptz AND "event_at" < ${to}::timestamptz
    `;
    await db.$executeRaw`
      DELETE FROM xb.fleet_transaction_days WHERE "park_day" = ${parkDay}::date
    `;
  }
};
