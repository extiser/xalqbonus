import { db } from '#server/db';

/**
 * История заказов парка (issue #315).
 *
 * Отдельная от `trips` таблица: запись поездки в `trips` начисляет баллы, а историю за год
 * начислять нельзя. Про Fleet репозиторий не знает — принимает собственные структуры.
 */

/** Сколько строк уходит в базу одним запросом: страница выборки — до 500 заказов. */
const CHUNK_SIZE = 1_000;

export type FleetOrderHistoryInput = {
  orderId: string;
  profileId: string;
  status: string;
  category: string;
  paymentMethod: string;
  workRuleId: string | null;
  bookedAt: Date;
  endedAt: Date | null;
  /** Строкой, как отдал API: разбор числа с фиксированной точкой во float теряет копейки. */
  price: string;
  carCallsign: string | null;
};

const asTimestampLiteral = (value: Date | null): string | null => value?.toISOString() ?? null;

/**
 * Кладёт заказы: новый вставляется, известный обновляется по `order_id` — повтор суток
 * не плодит строк и подтягивает изменившийся статус. Схема указана явно: у сырого
 * соединения `search_path` дефолтный (docs/decisions.md → «В сыром SQL схема указывается
 * явно»).
 */
export const upsertFleetOrderHistory = async (
  orders: readonly FleetOrderHistoryInput[],
): Promise<number> => {
  // Повтор `order_id` внутри одной вставки Postgres отбивает целиком; побеждает последний.
  const unique = [...new Map(orders.map((order) => [order.orderId, order])).values()];
  let written = 0;

  for (let offset = 0; offset < unique.length; offset += CHUNK_SIZE) {
    const chunk = unique.slice(offset, offset + CHUNK_SIZE);

    written += await db.$executeRaw`
      INSERT INTO xb.fleet_order_history (
        "order_id", "profile_id", "status", "category", "payment_method",
        "work_rule_id", "booked_at", "ended_at", "price", "car_callsign"
      )
      SELECT incoming."order_id",
             incoming."profile_id",
             incoming."status",
             incoming."category",
             incoming."payment_method",
             incoming."work_rule_id",
             incoming."booked_at"::timestamptz,
             incoming."ended_at"::timestamptz,
             incoming."price"::numeric,
             incoming."car_callsign"
        FROM unnest(
               ${chunk.map((order) => order.orderId)}::text[],
               ${chunk.map((order) => order.profileId)}::text[],
               ${chunk.map((order) => order.status)}::text[],
               ${chunk.map((order) => order.category)}::text[],
               ${chunk.map((order) => order.paymentMethod)}::text[],
               ${chunk.map((order) => order.workRuleId)}::text[],
               ${chunk.map((order) => asTimestampLiteral(order.bookedAt))}::text[],
               ${chunk.map((order) => asTimestampLiteral(order.endedAt))}::text[],
               ${chunk.map((order) => order.price)}::text[],
               ${chunk.map((order) => order.carCallsign)}::text[]
             ) AS incoming(
               "order_id", "profile_id", "status", "category", "payment_method",
               "work_rule_id", "booked_at", "ended_at", "price", "car_callsign"
             )
      ON CONFLICT ("order_id") DO UPDATE SET
        "profile_id"     = EXCLUDED."profile_id",
        "status"         = EXCLUDED."status",
        "category"       = EXCLUDED."category",
        "payment_method" = EXCLUDED."payment_method",
        "work_rule_id"   = EXCLUDED."work_rule_id",
        "booked_at"      = EXCLUDED."booked_at",
        "ended_at"       = EXCLUDED."ended_at",
        "price"          = EXCLUDED."price",
        "car_callsign"   = EXCLUDED."car_callsign",
        "fetched_at"     = now()
    `;
  }

  return written;
};

export type FleetOrderHistoryDayInput = {
  /** Парковые сутки: дата в UTC, полночь. */
  parkDay: Date;
  orders: number;
  complete: number;
  malformed: number;
  pages: number;
  rateLimited: number;
  startedAt: Date;
  /** `null` — обход суток прервался. */
  finishedAt: Date | null;
};

export const upsertFleetOrderHistoryDay = async (day: FleetOrderHistoryDayInput): Promise<void> => {
  const { parkDay, ...columns } = day;

  await db.fleetOrderHistoryDay.upsert({
    where: { parkDay },
    create: { parkDay, ...columns },
    update: columns,
  });
};
