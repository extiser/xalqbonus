import { db } from '#server/db';

/**
 * Заказы, за которые балл уже дал старый бот (`xb.legacy_awarded_trips`).
 *
 * Пишет таблицу шаг переноса, читает — начисление за поездки. Про `public` репозиторий
 * не знает ничего: строки ему приносит сеанс чтения старой схемы (`legacyPublic.ts`),
 * а ядро начисления в `public` не ходит вовсе (docs/decisions.md → «Граница со старым
 * ботом — по засчитанным заказам»).
 */

/** Сколько строк уходит в базу одним запросом. */
const CHUNK_SIZE = 1_000;

export type LegacyAwardedTripInput = {
  orderId: string;
  legacyDriverId: number;
  bookedAt: Date;
};

/**
 * Кладёт заказы пачками. Уже лежащий заказ не трогается — ни `legacy_driver_id`, ни время
 * переноса: повторный прогон шага ничего не меняет (`ON CONFLICT DO NOTHING`).
 *
 * Возвращает, сколько строк вставлено сейчас. Схема указана явно: у сырого запроса
 * `search_path` дефолтный (docs/decisions.md → «В сыром SQL схема указывается явно»).
 */
export const insertLegacyAwardedTrips = async (
  trips: readonly LegacyAwardedTripInput[],
  importedAt: Date,
): Promise<number> => {
  let inserted = 0;

  for (let offset = 0; offset < trips.length; offset += CHUNK_SIZE) {
    const chunk = trips.slice(offset, offset + CHUNK_SIZE);

    inserted += await db.$executeRaw`
      INSERT INTO xb.legacy_awarded_trips ("order_id", "legacy_driver_id", "booked_at", "imported_at")
      SELECT incoming."order_id",
             incoming."legacy_driver_id"::int,
             incoming."booked_at"::timestamptz,
             ${importedAt.toISOString()}::timestamptz
        FROM unnest(
               ${chunk.map((trip) => trip.orderId)}::text[],
               ${chunk.map((trip) => String(trip.legacyDriverId))}::text[],
               ${chunk.map((trip) => trip.bookedAt.toISOString())}::text[]
             ) AS incoming("order_id", "legacy_driver_id", "booked_at")
      ON CONFLICT ("order_id") DO NOTHING
    `;
  }

  return inserted;
};

/**
 * Какие из заказов пачки засчитал старый бот. Один запрос на пачку прогона, а не по запросу
 * на поездку: у догоняющего прогона страница — сотни заказов.
 */
export const findLegacyAwardedOrderIds = async (
  orderIds: readonly string[],
): Promise<Set<string>> => {
  if (orderIds.length === 0) {
    return new Set();
  }

  const rows = await db.$queryRaw<{ orderId: string }[]>`
    SELECT "order_id" AS "orderId"
      FROM xb.legacy_awarded_trips
     WHERE "order_id" = ANY(${[...orderIds]}::text[])
  `;

  return new Set(rows.map((row) => row.orderId));
};

export type LegacyAwardedTripsTotals = {
  total: number;
  /** Самое раннее и самое позднее бронирование среди перенесённых. Пусто — таблица пуста. */
  bookedFrom: Date | null;
  bookedTo: Date | null;
};

/** Итог по таблице для отчёта переноса: отчёт описывает базу, а не счётчики прогона. */
export const readLegacyAwardedTripsTotals = async (): Promise<LegacyAwardedTripsTotals> => {
  const rows = await db.$queryRaw<{ total: bigint; bookedFrom: Date | null; bookedTo: Date | null }[]>`
    SELECT COUNT(*)         AS "total",
           MIN("booked_at") AS "bookedFrom",
           MAX("booked_at") AS "bookedTo"
      FROM xb.legacy_awarded_trips
  `;

  const row = rows[0];

  return {
    total: Number(row?.total ?? 0n),
    bookedFrom: row?.bookedFrom ?? null,
    bookedTo: row?.bookedTo ?? null,
  };
};
