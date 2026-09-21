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

/** Офисы и товары, заведённые тестами каталога. Уборка — по ним же. */
const createdOfficeIds = new Set<string>();
const createdProductIds = new Set<string>();

/**
 * Идентификаторы записей старой базы для фикстур переноса.
 *
 * Отрицательные и убывающие: `legacy_driver_id` — первичный ключ, пришедший из чужой
 * базы, и занять им номер настоящей записи тест не должен даже на локальной копии.
 */
let lastLegacyDriverId = -1;

const nextLegacyDriverId = (): number => {
  lastLegacyDriverId -= 1;

  return lastLegacyDriverId;
};

export type TestPerson = {
  personId: string;
  profileId: string;
};

/**
 * Время вступления в программу по умолчанию — заведомо раньше поездок любого теста.
 *
 * Приветственный бонус считает поездки от `joined_at`, и умолчание `now()` означало бы,
 * что у каждого тестового участника все поездки сделаны до вступления: сценарии, к бонусу
 * отношения не имеющие, молча проверяли бы не то, что написано в их названии.
 */
const DEFAULT_JOINED_AT = new Date('2026-01-01T00:00:00.000Z');

export type CreateTestPersonInput = {
  inProgram: boolean;
  /** Когда человек вступил в программу. Поездки до этого момента бонусу не засчитываются. */
  joinedAt?: Date;
};

/**
 * Заводит человека с профилем в парке. `inProgram` управляет наличием `person_settings` —
 * это и есть граница «известен парку / участвует в программе» (docs/drivers.md).
 */
export const createTestPerson = async ({
  inProgram,
  joinedAt = DEFAULT_JOINED_AT,
}: CreateTestPersonInput): Promise<TestPerson> => {
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
      data: { personId: person.id, language: 'ru', joinedSource: 'test', joinedAt },
    });
  }

  return { personId: person.id, profileId };
};

/**
 * Отмечает человека перенесённым из старой базы — строкой в карте переноса.
 *
 * Именно этот признак закрывает приветственный бонус (docs/decisions.md → «Приветственный
 * бонус — только новым»), и проверять его надо настоящей строкой: условие живёт в запросе,
 * а не в коде, и заглушка подтвердила бы работу кода, а не правила.
 */
export const markPersonAsLegacy = async (personId: string): Promise<void> => {
  await db.$executeRaw`
    INSERT INTO xb.legacy_driver_map (
      "legacy_driver_id", "person_id", "match_method", "telegram_status", "legacy_points"
    )
    VALUES (
      ${nextLegacyDriverId()},
      ${personId}::uuid,
      'license'::xb.match_method,
      'skipped'::xb.legacy_telegram_status,
      0
    )
  `;
};

/**
 * Переводит профиль парка на другого человека — так выглядит переоформление в парке
 * и склейка двойных учётных записей: профилей два, человек один.
 */
export const reassignProfileToPerson = async (
  profileId: string,
  personId: string,
): Promise<void> => {
  await db.parkProfile.update({ where: { profileId }, data: { personId } });
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


/**
 * Офис. `archived` заводит закрытый: такой не показывается водителю и заказов не принимает.
 */
export const createTestOffice = async ({ archived = false }: { archived?: boolean } = {}): Promise<
  string
> => {
  const rows = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO xb.offices ("name", "address", "archived_at")
    VALUES (
      'Тестовый офис',
      'Ташкент, тестовый адрес',
      ${archived ? new Date() : null}::timestamptz
    )
    RETURNING "id"
  `;

  const officeId = rows[0]?.id as string;
  createdOfficeIds.add(officeId);

  return officeId;
};

export type CreateTestProductInput = {
  /** Пусто — приз без цены в баллах: такой бывает только с `promo`. */
  pricePoints: number | null;
  archived?: boolean;
  promo?: boolean;
  hiddenInCatalog?: boolean;
};

/**
 * Товар каталога — опубликованный, как всё, что живёт на витрине. Сумовые цены тестам
 * безразличны и ставятся любыми неотрицательными.
 */
export const createTestProduct = async ({
  pricePoints,
  archived = false,
  promo = false,
  hiddenInCatalog = false,
}: CreateTestProductInput): Promise<string> => {
  const rows = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO xb.products (
      "name", "price_points", "price_retail", "price_cost", "published_at", "archived_at",
      "promo", "hidden_in_catalog"
    )
    VALUES (
      'Тестовый товар',
      ${pricePoints}::int,
      ${(pricePoints ?? 5) * 1000},
      ${(pricePoints ?? 5) * 800},
      now(),
      ${archived ? new Date() : null}::timestamptz,
      ${promo},
      ${hiddenInCatalog}
    )
    RETURNING "id"
  `;

  const productId = rows[0]?.id as string;
  createdProductIds.add(productId);

  return productId;
};

/** Товар, заведённый сервисом, а не фикстурой, — чтобы уборка сняла и его. */
export const trackTestProduct = (productId: string): void => {
  createdProductIds.add(productId);
};

export type StockSnapshot = {
  onHand: number;
  reserved: number;
};

/**
 * Остаток пары «офис + товар». Строки нет — значит движений по ней не было ни одного,
 * и это не то же самое, что нули: тест, ожидающий ноль, обязан различать.
 */
export const readStock = async (
  officeId: string,
  productId: string,
): Promise<StockSnapshot | null> => {
  const rows = await db.$queryRaw<StockSnapshot[]>`
    SELECT "on_hand" AS "onHand", "reserved"
      FROM xb.office_stock
     WHERE "office_id" = ${officeId}::uuid AND "product_id" = ${productId}::uuid
  `;

  return rows[0] ?? null;
};

export type OrderSnapshot = {
  id: string;
  number: number;
  status: string;
  code: string;
  totalPoints: number;
  issuedAt: Date | null;
  issuedByEmployeeId: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  cancelledByEmployeeId: string | null;
  spendTransferId: string;
  refundTransferId: string | null;
};

export const readOrder = async (orderId: string): Promise<OrderSnapshot | null> => {
  const rows = await db.$queryRaw<OrderSnapshot[]>`
    SELECT "id",
           "number",
           "status"::text                 AS "status",
           "code",
           "total_points"                 AS "totalPoints",
           "issued_at"                    AS "issuedAt",
           "issued_by_employee_id"        AS "issuedByEmployeeId",
           "cancelled_at"                 AS "cancelledAt",
           "cancel_reason"::text          AS "cancelReason",
           "cancelled_by_employee_id"     AS "cancelledByEmployeeId",
           "spend_transfer_id"            AS "spendTransferId",
           "refund_transfer_id"           AS "refundTransferId"
      FROM xb.orders
     WHERE "id" = ${orderId}::uuid
  `;

  return rows[0] ?? null;
};

/** Сколько заказов у человека. Ноль — то, что проверяют сценарии отката оформления. */
export const countOrdersByPerson = async (personId: string): Promise<number> => {
  const rows = await db.$queryRaw<{ total: number }[]>`
    SELECT count(*)::int AS "total" FROM xb.orders WHERE "person_id" = ${personId}::uuid
  `;

  return rows[0]?.total ?? 0;
};

export type StockMovementSnapshot = {
  kind: string;
  productId: string;
  deltaOnHand: number;
  deltaReserved: number;
  orderId: string | null;
};

/** Журнал движения по паре «офис + товар», по порядку. */
export const listStockMovements = async (
  officeId: string,
  productId: string,
): Promise<StockMovementSnapshot[]> =>
  db.$queryRaw<StockMovementSnapshot[]>`
    SELECT "kind"::text      AS "kind",
           "product_id"      AS "productId",
           "delta_on_hand"   AS "deltaOnHand",
           "delta_reserved"  AS "deltaReserved",
           "order_id"        AS "orderId"
      FROM xb.stock_movements
     WHERE "office_id" = ${officeId}::uuid AND "product_id" = ${productId}::uuid
     ORDER BY "id"
  `;

/**
 * Отправляет срок заказа в прошлое — так выглядит заказ, который водитель оформил
 * и не забрал.
 *
 * Ждать сутки тест не может, а подменять системное время процесса значило бы проверять
 * не то, что делает воркер: срок сравнивается с `now()` базы.
 */
export const expireTestOrder = async (orderId: string): Promise<void> => {
  await db.$executeRaw`
    UPDATE xb.orders
       SET "expires_at" = now() - make_interval(hours => 1)
     WHERE "id" = ${orderId}::uuid
  `;
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

/** Сколько переводов этой причины прошло по счёту человека. */
export const countTransfersByReason = async (
  personId: string,
  reason: string,
): Promise<number> => {
  const rows = await db.$queryRaw<{ total: number }[]>`
    SELECT count(*)::int AS "total"
      FROM xb.point_transfers AS transfer
      JOIN xb.accounts AS account
        ON account."id" IN (transfer."from_account_id", transfer."to_account_id")
     WHERE account."type" = 'driver'
       AND account."person_id" = ${personId}::uuid
       AND transfer."reason" = ${reason}::xb.point_reason
  `;

  return rows[0]?.total ?? 0;
};

/** Перевод с его контекстом: заказ, причина, сумма. */
export const readTransfer = async (
  transferId: string,
): Promise<{ reason: string; amount: bigint; orderId: string | null } | null> => {
  const rows = await db.$queryRaw<{ reason: string; amount: bigint; orderId: string | null }[]>`
    SELECT "reason"::text AS "reason", "amount", "order_id" AS "orderId"
      FROM xb.point_transfers
     WHERE "id" = ${transferId}::uuid
  `;

  return rows[0] ?? null;
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

  const officeIds = [...createdOfficeIds];
  const productIds = [...createdProductIds];
  createdOfficeIds.clear();
  createdProductIds.clear();

  // Тест, ничего не заводивший, не открывает транзакцию и не пересчитывает системные счета.
  if (personIds.length === 0 && officeIds.length === 0 && productIds.length === 0) {
    return;
  }

  await db.$transaction(async (transaction) => {
    // Каталог уходит первым, и порядок внутри него не переставляется.
    //
    // `stock_movements` — до заказов: внешний ключ движения на заказ стоит на `SET NULL`,
    // и удаление заказа первым обнулило бы `order_id` у движения `order_reserve`, нарушив
    // `stock_movements_kind_signs_check`. Отказ пришёл бы не там, где ошибка.
    //
    // Заказы — до переводов: `orders.spend_transfer_id` стоит на `RESTRICT`, а
    // `refund_transfer_id` — на `SET NULL`, который сломал бы проверку согласованности
    // статуса у отменённого заказа.
    await transaction.$executeRaw`
      DELETE FROM xb.stock_movements
       WHERE "office_id" = ANY(${officeIds}::uuid[])
          OR "product_id" = ANY(${productIds}::uuid[])
    `;
    // Награды — после движений и до товаров, офисов и людей: движение ссылается на награду
    // ключом `SET NULL`, который обнулил бы `reward_id` у `reward_reserve` и нарушил проверку
    // знаков, а награда ссылается на товар, офис и человека ключами `RESTRICT`.
    await transaction.$executeRaw`
      DELETE FROM xb.rewards
       WHERE "person_id" = ANY(${personIds}::uuid[])
          OR "office_id" = ANY(${officeIds}::uuid[])
          OR "product_id" = ANY(${productIds}::uuid[])
    `;
    await transaction.$executeRaw`
      DELETE FROM xb.order_items
       WHERE "order_id" IN (
             SELECT "id" FROM xb.orders
              WHERE "person_id" = ANY(${personIds}::uuid[])
                 OR "office_id" = ANY(${officeIds}::uuid[])
       )
    `;
    await transaction.$executeRaw`
      DELETE FROM xb.orders
       WHERE "person_id" = ANY(${personIds}::uuid[])
          OR "office_id" = ANY(${officeIds}::uuid[])
    `;
    await transaction.$executeRaw`
      DELETE FROM xb.office_stock
       WHERE "office_id" = ANY(${officeIds}::uuid[])
          OR "product_id" = ANY(${productIds}::uuid[])
    `;
    await transaction.$executeRaw`
      DELETE FROM xb.products WHERE "id" = ANY(${productIds}::uuid[])
    `;
    await transaction.$executeRaw`
      DELETE FROM xb.offices WHERE "id" = ANY(${officeIds}::uuid[])
    `;
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
      DELETE FROM xb.legacy_driver_map WHERE "person_id" = ANY(${personIds}::uuid[])
    `;
    // Телефоны ссылаются на профиль. Их заводит и уборка сотрудников (`setTestProfilePhone`),
    // но она идёт после этой: сотрудник, вручивший награду, уходит только вместе с наградой.
    await transaction.$executeRaw`
      DELETE FROM xb.profile_phones
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
  welcomeAwarded: number;
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
           "welcome_awarded"         AS "welcomeAwarded",
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

/** Заводит завершившийся успехом прогон — тот, по которому экран участника ставит отметку. */
export const insertSucceededSyncRun = async (
  kind: string,
  startedAt: Date,
  finishedAt: Date,
): Promise<string> => {
  const rows = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO xb.sync_runs ("kind", "status", "started_at", "finished_at")
    VALUES (
      ${kind}::xb.sync_kind,
      'succeeded'::xb.sync_status,
      ${startedAt.toISOString()}::timestamptz,
      ${finishedAt.toISOString()}::timestamptz
    )
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
/**
 * Ломает кэш остатка мимо журнала движения — то, что обязаны поймать запросы остатков.
 *
 * Второе из двух мест во всём репозитории, где `office_stock` правится не вместе
 * с движением, и оба — фикстуры тестов. Проверка инварианта, которая не умеет падать,
 * не проверяет ничего.
 */
export const breakStockCacheForTest = async (
  officeId: string,
  productId: string,
  deltaOnHand: number,
  deltaReserved = 0,
): Promise<void> => {
  await db.$executeRaw`
    UPDATE xb.office_stock
       SET "on_hand"  = "on_hand"  + ${deltaOnHand},
           "reserved" = "reserved" + ${deltaReserved}
     WHERE "office_id" = ${officeId}::uuid AND "product_id" = ${productId}::uuid
  `;
};

export const breakBalanceCacheForTest = async (personId: string, delta: number): Promise<void> => {
  await db.$executeRawUnsafe(
    'UPDATE xb.accounts SET "balance" = "balance" + $2 WHERE "type" = \'driver\' AND "person_id" = $1::uuid',
    personId,
    delta,
  );
};

export const disconnectDatabase = (): Promise<void> => db.$disconnect();
