import { db } from '#server/db';

/**
 * Фикстуры и уборка для тестов ядра баллов.
 *
 * Тесты ходят в настоящую базу, а не в заглушку: проверяются ровно те вещи, которых
 * в заглушке нет — уникальное ограничение на ключ идемпотентности, `CHECK` на минусовой
 * баланс, блокировки и инкремент на стороне базы. Заглушка подтвердила бы работу кода,
 * а не работу ядра.
 *
 * Уборка идёт по людям, заведённым тестом, а не `TRUNCATE` по таблицам: локальная база
 * общая с разведкой и с будущей синхронизацией, и снос всего журнала ради одного теста —
 * это потеря данных, которые никто не просил удалять.
 */

if (process.env.NODE_ENV === 'production') {
  throw new Error('тесты ядра баллов не запускаются против боевого окружения');
}

/** Люди, заведённые этим файлом тестов. Уборка идёт по ним и только по ним. */
const createdPersonIds = new Set<string>();

export type TestPerson = {
  personId: string;
  profileId: string;
};

/**
 * Заводит человека с профилем в парке. `inProgram` управляет наличием `person_settings` —
 * это и есть граница «известен парку / участвует в программе» (docs/drivers.md).
 */
export const createTestPerson = async ({ inProgram }: { inProgram: boolean }): Promise<TestPerson> => {
  const person = await db.person.create({ data: {} });
  createdPersonIds.add(person.id);

  const profileId = `test-profile-${person.id}`;
  const now = new Date();

  await db.parkProfile.create({
    data: {
      profileId,
      personId: person.id,
      parkId: 'test-park',
      firstName: 'Тест',
      lastName: 'Тестов',
      workStatus: 'working',
      employmentType: 'self_employed',
      isSelfemployed: true,
      workRuleId: 'test-work-rule',
      currentStatus: 'offline',
      apiCreatedAt: now,
      apiModifiedAt: now,
      apiUpdatedAt: now,
      lastSyncedAt: now,
    },
  });

  if (inProgram) {
    await db.personSettings.create({
      data: { personId: person.id, language: 'ru', joinedSource: 'test' },
    });
  }

  return { personId: person.id, profileId };
};

export type CreateTestTripInput = {
  profileId: string;
  tripOrderId: string;
  status: string;
  endedAt: Date | null;
};

export const createTestTrip = async (input: CreateTestTripInput): Promise<void> => {
  const bookedAt = new Date('2026-08-01T10:00:00.000Z');

  await db.trip.create({
    data: {
      orderId: input.tripOrderId,
      profileId: input.profileId,
      status: input.status,
      category: 'econom',
      paymentMethod: 'cash',
      provider: 'platform',
      bookedAt,
      apiCreatedAt: bookedAt,
      endedAt: input.endedAt,
      price: 25000,
      carId: 'test-car',
      carLicenseNumber: '01A123AA',
      carBrandModel: 'Chevrolet Cobalt',
      addressFromText: 'Ташкент, тестовый адрес',
      addressFromLat: 41.3,
      addressFromLon: 69.24,
      flags: [],
      amenities: [],
    },
  });
};

/** Переводит поездку в другой статус — так же, как это сделает синхронизация. */
export const setTripStatus = async (
  tripOrderId: string,
  status: string,
  endedAt: Date | null,
): Promise<void> => {
  await db.trip.update({ where: { orderId: tripOrderId }, data: { status, endedAt } });
};

export const readAccountBalance = async (personId: string): Promise<bigint> => {
  const rows = await db.$queryRaw<{ balance: bigint }[]>`
    SELECT "balance" FROM xb.accounts WHERE "type" = 'driver' AND "person_id" = ${personId}::uuid
  `;

  return rows[0]?.balance ?? 0n;
};

export const readSystemBalance = async (type: string): Promise<bigint> => {
  const rows = await db.$queryRaw<{ balance: bigint }[]>`
    SELECT "balance" FROM xb.accounts WHERE "type" = ${type}::xb.account_type
  `;

  return rows[0]?.balance ?? 0n;
};

export const countTransfersByKey = async (idempotencyKey: string): Promise<number> => {
  const rows = await db.$queryRaw<{ total: bigint }[]>`
    SELECT COUNT(*) AS total FROM xb.point_transfers WHERE "idempotency_key" = ${idempotencyKey}
  `;

  return Number(rows[0]?.total ?? 0n);
};

/**
 * Убирает за тестом: людей, их профили, поездки, счета и связанные переводы.
 *
 * Системные счета не удаляются — они заведены миграцией. Их кэш баланса пересчитывается
 * от журнала: удалённые записи ушли из журнала, и без пересчёта второй инвариант
 * («сумма записей по счёту равна кэшу») справедливо расходился бы после уборки.
 */
export const cleanupTestData = async (): Promise<void> => {
  const personIds = [...createdPersonIds];
  createdPersonIds.clear();

  if (personIds.length === 0) {
    return;
  }

  await db.$transaction(async (transaction) => {
    await transaction.$executeRaw`
      DELETE FROM xb.point_entries
       WHERE "transfer_id" IN (
             SELECT "id" FROM xb.point_transfers
              WHERE "from_account_id" IN (SELECT "id" FROM xb.accounts WHERE "person_id" = ANY(${personIds}::uuid[]))
                 OR "to_account_id"   IN (SELECT "id" FROM xb.accounts WHERE "person_id" = ANY(${personIds}::uuid[]))
       )
    `;
    await transaction.$executeRaw`
      DELETE FROM xb.point_transfers
       WHERE "from_account_id" IN (SELECT "id" FROM xb.accounts WHERE "person_id" = ANY(${personIds}::uuid[]))
          OR "to_account_id"   IN (SELECT "id" FROM xb.accounts WHERE "person_id" = ANY(${personIds}::uuid[]))
    `;
    await transaction.$executeRaw`
      DELETE FROM xb.accounts WHERE "person_id" = ANY(${personIds}::uuid[])
    `;
    // События и точки маршрута ссылаются на поездку — уходят первыми.
    await transaction.$executeRaw`
      DELETE FROM xb.trip_events
       WHERE "trip_id" IN (
             SELECT "id" FROM xb.trips
              WHERE "profile_id" IN (SELECT "profile_id" FROM xb.park_profiles WHERE "person_id" = ANY(${personIds}::uuid[]))
       )
    `;
    await transaction.$executeRaw`
      DELETE FROM xb.trip_route_points
       WHERE "trip_id" IN (
             SELECT "id" FROM xb.trips
              WHERE "profile_id" IN (SELECT "profile_id" FROM xb.park_profiles WHERE "person_id" = ANY(${personIds}::uuid[]))
       )
    `;
    await transaction.$executeRaw`
      DELETE FROM xb.trips
       WHERE "profile_id" IN (SELECT "profile_id" FROM xb.park_profiles WHERE "person_id" = ANY(${personIds}::uuid[]))
    `;
    await transaction.$executeRaw`
      DELETE FROM xb.park_profiles WHERE "person_id" = ANY(${personIds}::uuid[])
    `;
    await transaction.$executeRaw`
      DELETE FROM xb.person_settings WHERE "person_id" = ANY(${personIds}::uuid[])
    `;
    await transaction.$executeRaw`
      DELETE FROM xb.persons WHERE "id" = ANY(${personIds}::uuid[])
    `;
    await transaction.$executeRaw`
      UPDATE xb.accounts AS account
         SET "balance" = COALESCE(
               (SELECT SUM(entry.delta) FROM xb.point_entries AS entry WHERE entry.account_id = account.id),
               0
             ),
             "updated_at" = now()
       WHERE account."type" <> 'driver'
    `;
  });
};

/**
 * Убирает следы прогонов синхронизации заказов: отметки и строки прогонов.
 *
 * Отдельно от уборки по людям: отметка и прогон не принадлежат никакому человеку, а тест
 * синхронизации обязан начинаться с чистой отметки — иначе окно первого прогона зависело бы
 * от того, что оставил после себя предыдущий файл тестов.
 */
export const resetOrdersSyncState = async (): Promise<void> => {
  // Отметка ссылается на прогон, поездка, детали и пропущенное — тоже. Порядок удаления
  // идёт по ссылкам: внешние ключи журнала стоят на RESTRICT, и это намеренно — журнал
  // прогонов не должен уходить молча вслед за строкой прогона.
  await db.$executeRaw`DELETE FROM xb.sync_state WHERE "kind" IN ('orders', 'orders_catchup')`;
  await db.$executeRaw`
    UPDATE xb.trips SET "sync_run_id" = NULL
     WHERE "sync_run_id" IN (SELECT "id" FROM xb.sync_runs WHERE "kind" IN ('orders', 'orders_catchup'))
  `;
  await db.$executeRaw`
    DELETE FROM xb.sync_skips
     WHERE "first_run_id" IN (SELECT "id" FROM xb.sync_runs WHERE "kind" IN ('orders', 'orders_catchup'))
        OR "last_run_id"  IN (SELECT "id" FROM xb.sync_runs WHERE "kind" IN ('orders', 'orders_catchup'))
  `;
  await db.$executeRaw`
    DELETE FROM xb.sync_run_orders
     WHERE "run_id" IN (SELECT "id" FROM xb.sync_runs WHERE "kind" IN ('orders', 'orders_catchup'))
  `;
  await db.$executeRaw`DELETE FROM xb.sync_runs WHERE "kind" IN ('orders', 'orders_catchup')`;
};

/** Детали прогона заказов — то, что до этой таблицы жило только в одной строке лога. */
export type SyncRunOrdersRow = {
  pages: number;
  ordersInserted: number;
  ordersUpdated: number;
  malformed: number;
  skippedUnknownProfile: number;
  unknownProfiles: number;
  awarded: number;
  alreadyAwarded: number;
  notCompleted: number;
  withoutEndedAt: number;
  outsideProgram: number;
  unknownTrip: number;
};

export const readSyncRunOrders = async (runId: string): Promise<SyncRunOrdersRow | null> => {
  const rows = await db.$queryRaw<SyncRunOrdersRow[]>`
    SELECT "pages",
           "orders_inserted"         AS "ordersInserted",
           "orders_updated"          AS "ordersUpdated",
           "malformed",
           "skipped_unknown_profile" AS "skippedUnknownProfile",
           "unknown_profiles"        AS "unknownProfiles",
           "awarded",
           "already_awarded"         AS "alreadyAwarded",
           "not_completed"           AS "notCompleted",
           "without_ended_at"        AS "withoutEndedAt",
           "outside_program"         AS "outsideProgram",
           "unknown_trip"            AS "unknownTrip"
      FROM xb.sync_run_orders
     WHERE "run_id" = ${runId}::uuid
  `;

  return rows[0] ?? null;
};

export type SyncSkipRow = {
  reason: string;
  reference: string;
  detail: string | null;
  firstRunId: string;
  lastRunId: string;
  timesSeen: number;
  resolvedAt: Date | null;
};

export const readSyncSkips = async (): Promise<SyncSkipRow[]> => {
  const rows = await db.$queryRaw<SyncSkipRow[]>`
    SELECT "reason"::text  AS "reason",
           "reference",
           "detail",
           "first_run_id"  AS "firstRunId",
           "last_run_id"   AS "lastRunId",
           "times_seen"    AS "timesSeen",
           "resolved_at"   AS "resolvedAt"
      FROM xb.sync_skips
     ORDER BY "reason", "reference"
  `;

  return rows;
};

/**
 * Заводит строку прогона в состоянии `running` с заданным временем старта.
 *
 * Так выглядит строка, брошенная процессом, которого убили: закрыть её было некому.
 */
export const insertRunningSyncRun = async (kind: string, startedAt: Date): Promise<string> => {
  const rows = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO xb.sync_runs ("kind", "status", "started_at")
    VALUES (${kind}::xb.sync_kind, 'running'::xb.sync_status, ${startedAt.toISOString()}::timestamptz)
    RETURNING "id"
  `;

  return rows[0]?.id as string;
};

export type SyncRunRow = {
  id: string;
  kind: string;
  status: string;
  windowFrom: Date | null;
  windowTo: Date | null;
  itemsSeen: number;
  itemsWritten: number;
  rateLimited: number;
  error: string | null;
};

export const readSyncRuns = async (kind: string): Promise<SyncRunRow[]> => {
  const rows = await db.$queryRaw<
    (Omit<SyncRunRow, 'itemsSeen' | 'itemsWritten' | 'rateLimited'> & {
      itemsSeen: number;
      itemsWritten: number;
      rateLimited: number;
    })[]
  >`
    SELECT "id",
           "kind"::text        AS "kind",
           "status"::text      AS "status",
           "window_from"       AS "windowFrom",
           "window_to"         AS "windowTo",
           "items_seen"        AS "itemsSeen",
           "items_written"     AS "itemsWritten",
           "rate_limited"      AS "rateLimited",
           "error"
      FROM xb.sync_runs
     WHERE "kind" = ${kind}::xb.sync_kind
     ORDER BY "started_at"
  `;

  return rows;
};

export const readSyncWatermark = async (kind: string): Promise<Date | null> => {
  const rows = await db.$queryRaw<{ watermark: Date | null }[]>`
    SELECT "watermark" FROM xb.sync_state WHERE "kind" = ${kind}::xb.sync_kind
  `;

  return rows[0]?.watermark ?? null;
};

export const readTripStatus = async (orderId: string): Promise<string | null> => {
  const rows = await db.$queryRaw<{ status: string }[]>`
    SELECT "status" FROM xb.trips WHERE "order_id" = ${orderId}
  `;

  return rows[0]?.status ?? null;
};

export const countTripEvents = async (orderId: string): Promise<number> => {
  const rows = await db.$queryRaw<{ total: bigint }[]>`
    SELECT COUNT(*) AS total
      FROM xb.trip_events AS event
      JOIN xb.trips AS trip ON trip."id" = event."trip_id"
     WHERE trip."order_id" = ${orderId}
  `;

  return Number(rows[0]?.total ?? 0n);
};

/**
 * Гоняет произвольный запрос — им тест инвариантов исполняет запросы, взятые
 * из scripts/invariants.sql, вместо того чтобы держать их вторую копию.
 */
export const runRawQuery = <Row>(sql: string): Promise<Row[]> => db.$queryRawUnsafe<Row[]>(sql);

/**
 * Ломает кэш баланса счёта мимо журнала — ровно то, что делает старый бот и что обязан
 * поймать второй инвариант. Нужна, чтобы проверка инвариантов не была проверкой,
 * которая не умеет падать.
 *
 * Это единственное место во всём репозитории, кроме уборки выше, где `accounts.balance`
 * меняется не сервисом журнала, и оба — фикстуры тестов, а не рабочий код.
 */
export const breakBalanceCacheForTest = async (personId: string, delta: number): Promise<void> => {
  await db.$executeRawUnsafe(
    'UPDATE xb.accounts SET "balance" = "balance" + $2 WHERE "type" = \'driver\' AND "person_id" = $1::uuid',
    personId,
    delta,
  );
};

export const disconnectDatabase = (): Promise<void> => db.$disconnect();
