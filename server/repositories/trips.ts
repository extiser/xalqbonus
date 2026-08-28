import { db } from '#server/db';

/**
 * Чтение поездок для начисления баллов.
 *
 * Человек здесь берётся через профиль (`trips.profile_id` → `park_profiles.person_id`),
 * а не хранится в самой поездке: баланс принадлежит человеку, и склейка двойных учётных
 * записей иначе превращалась бы в переписывание миллиона строк (prisma/schema.prisma).
 */

export type TripForAccrual = {
  tripOrderId: string;
  status: string;
  endedAt: Date | null;
  personId: string;
  /** Есть строка `person_settings` — человек участвует в программе. Реестр парка шире. */
  inProgram: boolean;
};

export const findTripsForAccrual = async (tripOrderIds: string[]): Promise<TripForAccrual[]> => {
  const trips = await db.trip.findMany({
    where: { orderId: { in: tripOrderIds } },
    select: {
      orderId: true,
      status: true,
      endedAt: true,
      profile: {
        select: {
          personId: true,
          person: { select: { settings: { select: { personId: true } } } },
        },
      },
    },
  });

  return trips.map((trip) => ({
    tripOrderId: trip.orderId,
    status: trip.status,
    endedAt: trip.endedAt,
    personId: trip.profile.personId,
    inProgram: trip.profile.person.settings !== null,
  }));
};

/**
 * Запись заказов, событий и точек маршрута.
 *
 * Идёт пачками сырым SQL через `unnest`: страница выборки — до 500 заказов, а по одному
 * запросу на строку это 500 круговых обходов, и `ON CONFLICT` типизированным API Prisma
 * всё равно не выражается. Схема указывается явно — у сырого соединения `search_path`
 * дефолтный, и запрос без префикса молча ушёл бы в `public`, куда писать нельзя ничем
 * и никогда (docs/decisions.md → «В сыром SQL схема указывается явно»).
 *
 * Массивы `flags` и `amenities` уезжают в базу строкой JSON и разворачиваются на месте:
 * `unnest` разбирает двумерный массив по элементам, а не по строкам, и колонка `text[]`
 * им не наполняется.
 */

/** Сколько строк уходит в базу одним запросом. */
const CHUNK_SIZE = 1_000;

const asTimestampLiteral = (value: Date | null): string | null => value?.toISOString() ?? null;

const chunked = <Item>(items: readonly Item[]): Item[][] => {
  const chunks: Item[][] = [];

  for (let offset = 0; offset < items.length; offset += CHUNK_SIZE) {
    chunks.push(items.slice(offset, offset + CHUNK_SIZE));
  }

  return chunks;
};

export type TripInput = {
  orderId: string;
  shortId: number | null;
  profileId: string;
  status: string;
  category: string;
  paymentMethod: string;
  provider: string;
  orderTypeId: string | null;
  orderTypeName: string | null;
  workRuleId: string | null;
  bookedAt: Date;
  apiCreatedAt: Date;
  drivingAt: Date | null;
  endedAt: Date | null;
  /** Строкой, как отдал API: разбор числа с фиксированной точкой во float теряет копейки. */
  price: string;
  mileage: string | null;
  carId: string;
  carCallsign: string | null;
  carLicenseNumber: string;
  carBrandModel: string;
  addressFromText: string;
  addressFromLat: number;
  addressFromLon: number;
  cancellationDescription: string | null;
  flags: string[];
  amenities: string[];
};

export type UpsertedTrip = {
  tripId: string;
  /** `false` — заказ уже лежал в базе и был обновлён. Перекрытие окон приносит такие каждый прогон. */
  inserted: boolean;
};

/**
 * Кладёт заказы: новый вставляется, известный обновляется по `order_id`.
 *
 * Обновление обязательно, а не «вставим, если нет»: статус заказа меняется со временем,
 * и запись обязана это отражать — иначе поездка, пойманная в промежуточном статусе,
 * навсегда останется незавершённой, как 243 613 записей в базе старого бота
 * (docs/analysis.md).
 *
 * Возвращает соответствие «идентификатор заказа → строка»: по нему пишутся события
 * и точки маршрута. `RETURNING` отдаёт и вставленные строки, и обновлённые, а различает
 * их выражение `xmax = 0`: у строки, вставленной этой же командой, поле пусто, у обновлённой
 * там номер нашей транзакции. Приём известный, но в документации его нет, поэтому оговорка:
 * он врал бы на строке, заблокированной в той же транзакции (`SELECT … FOR UPDATE`), — здесь
 * запись идёт одной самостоятельной командой, и такого случая нет. Считается им **только**
 * счётчик сводки: ни одно решение о начислении на нём не построено.
 */
export const upsertTrips = async (
  trips: readonly TripInput[],
  syncRunId: string | null,
  syncedAt: Date,
): Promise<Map<string, UpsertedTrip>> => {
  // Повтор `order_id` внутри одной вставки Postgres отбивает целиком: «ON CONFLICT DO
  // UPDATE не может тронуть строку дважды». Побеждает последнее вхождение — оно свежее.
  const unique = new Map<string, TripInput>(trips.map((trip) => [trip.orderId, trip]));
  const tripIds = new Map<string, UpsertedTrip>();

  for (const chunk of chunked([...unique.values()])) {
    const rows = await db.$queryRaw<{ id: string; orderId: string; inserted: boolean }[]>`
      INSERT INTO xb.trips (
        "order_id", "short_id", "profile_id",
        "status", "category", "payment_method", "provider",
        "order_type_id", "order_type_name", "work_rule_id",
        "booked_at", "api_created_at", "driving_at", "ended_at",
        "price", "mileage",
        "car_id", "car_callsign", "car_license_number", "car_brand_model",
        "address_from_text", "address_from_lat", "address_from_lon",
        "cancellation_description", "flags", "amenities",
        "sync_run_id", "synced_at"
      )
      SELECT incoming."order_id",
             incoming."short_id"::int,
             incoming."profile_id",
             incoming."status",
             incoming."category",
             incoming."payment_method",
             incoming."provider",
             incoming."order_type_id",
             incoming."order_type_name",
             incoming."work_rule_id",
             incoming."booked_at"::timestamptz,
             incoming."api_created_at"::timestamptz,
             incoming."driving_at"::timestamptz,
             incoming."ended_at"::timestamptz,
             incoming."price"::numeric,
             incoming."mileage"::numeric,
             incoming."car_id",
             incoming."car_callsign",
             incoming."car_license_number",
             incoming."car_brand_model",
             incoming."address_from_text",
             incoming."address_from_lat"::double precision,
             incoming."address_from_lon"::double precision,
             incoming."cancellation_description",
             ARRAY(SELECT jsonb_array_elements_text(incoming."flags"::jsonb)),
             ARRAY(SELECT jsonb_array_elements_text(incoming."amenities"::jsonb)),
             ${syncRunId}::uuid,
             ${asTimestampLiteral(syncedAt)}::timestamptz
        FROM unnest(
               ${chunk.map((trip) => trip.orderId)}::text[],
               ${chunk.map((trip) => trip.shortId?.toString() ?? null)}::text[],
               ${chunk.map((trip) => trip.profileId)}::text[],
               ${chunk.map((trip) => trip.status)}::text[],
               ${chunk.map((trip) => trip.category)}::text[],
               ${chunk.map((trip) => trip.paymentMethod)}::text[],
               ${chunk.map((trip) => trip.provider)}::text[],
               ${chunk.map((trip) => trip.orderTypeId)}::text[],
               ${chunk.map((trip) => trip.orderTypeName)}::text[],
               ${chunk.map((trip) => trip.workRuleId)}::text[],
               ${chunk.map((trip) => asTimestampLiteral(trip.bookedAt))}::text[],
               ${chunk.map((trip) => asTimestampLiteral(trip.apiCreatedAt))}::text[],
               ${chunk.map((trip) => asTimestampLiteral(trip.drivingAt))}::text[],
               ${chunk.map((trip) => asTimestampLiteral(trip.endedAt))}::text[],
               ${chunk.map((trip) => trip.price)}::text[],
               ${chunk.map((trip) => trip.mileage)}::text[],
               ${chunk.map((trip) => trip.carId)}::text[],
               ${chunk.map((trip) => trip.carCallsign)}::text[],
               ${chunk.map((trip) => trip.carLicenseNumber)}::text[],
               ${chunk.map((trip) => trip.carBrandModel)}::text[],
               ${chunk.map((trip) => trip.addressFromText)}::text[],
               ${chunk.map((trip) => String(trip.addressFromLat))}::text[],
               ${chunk.map((trip) => String(trip.addressFromLon))}::text[],
               ${chunk.map((trip) => trip.cancellationDescription)}::text[],
               ${chunk.map((trip) => JSON.stringify(trip.flags))}::text[],
               ${chunk.map((trip) => JSON.stringify(trip.amenities))}::text[]
             ) AS incoming(
               "order_id", "short_id", "profile_id",
               "status", "category", "payment_method", "provider",
               "order_type_id", "order_type_name", "work_rule_id",
               "booked_at", "api_created_at", "driving_at", "ended_at",
               "price", "mileage",
               "car_id", "car_callsign", "car_license_number", "car_brand_model",
               "address_from_text", "address_from_lat", "address_from_lon",
               "cancellation_description", "flags", "amenities"
             )
      ON CONFLICT ("order_id") DO UPDATE SET
        "short_id"                 = EXCLUDED."short_id",
        "profile_id"               = EXCLUDED."profile_id",
        "status"                   = EXCLUDED."status",
        "category"                 = EXCLUDED."category",
        "payment_method"           = EXCLUDED."payment_method",
        "provider"                 = EXCLUDED."provider",
        "order_type_id"            = EXCLUDED."order_type_id",
        "order_type_name"          = EXCLUDED."order_type_name",
        "work_rule_id"             = EXCLUDED."work_rule_id",
        "booked_at"                = EXCLUDED."booked_at",
        "api_created_at"           = EXCLUDED."api_created_at",
        "driving_at"               = EXCLUDED."driving_at",
        "ended_at"                 = EXCLUDED."ended_at",
        "price"                    = EXCLUDED."price",
        "mileage"                  = EXCLUDED."mileage",
        "car_id"                   = EXCLUDED."car_id",
        "car_callsign"             = EXCLUDED."car_callsign",
        "car_license_number"       = EXCLUDED."car_license_number",
        "car_brand_model"          = EXCLUDED."car_brand_model",
        "address_from_text"        = EXCLUDED."address_from_text",
        "address_from_lat"         = EXCLUDED."address_from_lat",
        "address_from_lon"         = EXCLUDED."address_from_lon",
        "cancellation_description" = EXCLUDED."cancellation_description",
        "flags"                    = EXCLUDED."flags",
        "amenities"                = EXCLUDED."amenities",
        "sync_run_id"              = EXCLUDED."sync_run_id",
        "synced_at"                = EXCLUDED."synced_at"
      RETURNING "id", "order_id" AS "orderId", (xmax = 0) AS "inserted"
    `;

    for (const row of rows) {
      tripIds.set(row.orderId, { tripId: row.id, inserted: row.inserted });
    }
  }

  return tripIds;
};

export type TripEventInput = {
  tripId: string;
  orderStatus: string;
  eventAt: Date;
};

/**
 * Пишет переходы статуса заказа.
 *
 * Повтор отсекается уникальным ограничением на тройку «поездка, статус, время события»,
 * а не проверкой «а нет ли уже такого»: окна опроса перекрываются по построению, и одни
 * и те же события приезжают каждый прогон (docs/principles.md → «Идемпотентность вместо
 * аккуратности»).
 */
export const insertTripEvents = async (events: readonly TripEventInput[]): Promise<number> => {
  let written = 0;

  for (const chunk of chunked(events)) {
    written += await db.$executeRaw`
      INSERT INTO xb.trip_events ("trip_id", "order_status", "event_at")
      SELECT incoming."trip_id"::uuid, incoming."order_status", incoming."event_at"::timestamptz
        FROM unnest(
               ${chunk.map((event) => event.tripId)}::text[],
               ${chunk.map((event) => event.orderStatus)}::text[],
               ${chunk.map((event) => asTimestampLiteral(event.eventAt))}::text[]
             ) AS incoming("trip_id", "order_status", "event_at")
      ON CONFLICT ("trip_id", "order_status", "event_at") DO NOTHING
    `;
  }

  return written;
};

export type TripRoutePointInput = {
  tripId: string;
  seq: number;
  address: string;
  lat: number;
  lon: number;
};

/** Пишет точки маршрута: до четырёх на заказ, у 3.8% заказов их нет вовсе. */
export const upsertTripRoutePoints = async (
  points: readonly TripRoutePointInput[],
): Promise<void> => {
  // Та же причина, что у заказов: пара «поездка, номер точки» не должна встретиться
  // в одной вставке дважды, иначе Postgres отбивает вставку целиком.
  const unique = new Map<string, TripRoutePointInput>(
    points.map((point) => [`${point.tripId}:${point.seq}`, point]),
  );

  for (const chunk of chunked([...unique.values()])) {
    await db.$executeRaw`
      INSERT INTO xb.trip_route_points ("trip_id", "seq", "address", "lat", "lon")
      SELECT incoming."trip_id"::uuid,
             incoming."seq"::int,
             incoming."address",
             incoming."lat"::double precision,
             incoming."lon"::double precision
        FROM unnest(
               ${chunk.map((point) => point.tripId)}::text[],
               ${chunk.map((point) => String(point.seq))}::text[],
               ${chunk.map((point) => point.address)}::text[],
               ${chunk.map((point) => String(point.lat))}::text[],
               ${chunk.map((point) => String(point.lon))}::text[]
             ) AS incoming("trip_id", "seq", "address", "lat", "lon")
      ON CONFLICT ("trip_id", "seq") DO UPDATE SET
        "address" = EXCLUDED."address",
        "lat"     = EXCLUDED."lat",
        "lon"     = EXCLUDED."lon"
    `;
  }
};
