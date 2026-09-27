import { randomUUID } from 'node:crypto';

import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';
import type { DemoRole } from '#server/generated/prisma/enums';
import { COMPLETED_TRIP_STATUS } from '#server/utils/tripStatus';

/**
 * Демо-доступ (issue #205): список демо-зрителей и заведение демо-водителя.
 *
 * Демо-водитель — выдуманный человек со всеми уровнями личности живого: запись человека,
 * удостоверение, профиль в парке. Строки здесь пишутся своими запросами, а не пачечными
 * функциями реестра: те написаны под синхронизацию, транзакции не принимают и о признаке
 * демо не знают. Участие, счёт и перевод баланса идут общими путями — `person_settings`,
 * `ensureDriverAccount`, `transferPoints`.
 *
 * Схема в сыром SQL указывается явно — у сырого соединения `search_path` дефолтный,
 * и запрос без префикса молча ушёл бы в `public` (docs/decisions.md → «В сыром SQL схема
 * указывается явно»).
 */

type Executor = Prisma.TransactionClient;

export type DemoViewerRow = {
  telegramUserId: bigint;
  label: string;
  personId: string;
  currentRole: DemoRole;
  disabledAt: Date | null;
};

const DEMO_VIEWER_COLUMNS = Prisma.sql`
  "telegram_user_id" AS "telegramUserId",
  "label",
  "person_id"        AS "personId",
  "current_role"     AS "currentRole",
  "disabled_at"      AS "disabledAt"
`;

/**
 * Зритель по Telegram — действующий и выключенный. Пусто — этого Telegram в списке нет.
 *
 * Читается на каждом запросе приложения, поэтому без блокировки: блокирует строку только
 * заведение и выключение зрителя (`lockDemoViewer`).
 */
export const findDemoViewer = async (telegramUserId: bigint): Promise<DemoViewerRow | null> => {
  const rows = await db.$queryRaw<DemoViewerRow[]>`
    SELECT ${DEMO_VIEWER_COLUMNS}
      FROM xb.demo_viewers
     WHERE "telegram_user_id" = ${telegramUserId.toString()}::text::bigint
  `;

  return rows[0] ?? null;
};

/**
 * То же внутри транзакции заведения или выключения — с блокировкой строки: два прогона
 * цели на один Telegram идут друг за другом, а не мимо друг друга.
 */
export const lockDemoViewer = async (
  telegramUserId: bigint,
  client: Executor,
): Promise<DemoViewerRow | null> => {
  const rows = await client.$queryRaw<DemoViewerRow[]>`
    SELECT ${DEMO_VIEWER_COLUMNS}
      FROM xb.demo_viewers
     WHERE "telegram_user_id" = ${telegramUserId.toString()}::text::bigint
       FOR UPDATE
  `;

  return rows[0] ?? null;
};

export type DemoViewerInput = {
  telegramUserId: bigint;
  label: string;
  personId: string;
};

export const insertDemoViewer = async (input: DemoViewerInput, client: Executor): Promise<void> => {
  await client.$executeRaw`
    INSERT INTO xb.demo_viewers ("telegram_user_id", "label", "person_id")
    VALUES (${input.telegramUserId.toString()}::text::bigint, ${input.label}, ${input.personId}::uuid)
  `;
};

/**
 * Подпись и включение одной записью. Действующему зрителю отметка выключения остаётся пустой,
 * выключенному — снимается: повторное внесение и есть включение.
 */
export const updateDemoViewerEnabled = async (
  telegramUserId: bigint,
  label: string,
  client: Executor,
): Promise<void> => {
  await client.$executeRaw`
    UPDATE xb.demo_viewers
       SET "label"       = ${label},
           "disabled_at" = NULL,
           "updated_at"  = now()
     WHERE "telegram_user_id" = ${telegramUserId.toString()}::text::bigint
  `;
};

export const updateDemoViewerDisabled = async (
  telegramUserId: bigint,
  disabledAt: Date,
  client: Executor,
): Promise<void> => {
  await client.$executeRaw`
    UPDATE xb.demo_viewers
       SET "disabled_at" = ${disabledAt.toISOString()}::text::timestamptz,
           "updated_at"  = now()
     WHERE "telegram_user_id" = ${telegramUserId.toString()}::text::bigint
  `;
};

/** Роль действующего зрителя. `false` — действующего зрителя с этим Telegram нет. */
export const updateDemoViewerRole = async (telegramUserId: bigint, role: DemoRole): Promise<boolean> => {
  const updated = await db.$executeRaw`
    UPDATE xb.demo_viewers
       SET "current_role" = ${role}::xb.demo_role,
           "updated_at"   = now()
     WHERE "telegram_user_id" = ${telegramUserId.toString()}::text::bigint
       AND "disabled_at" IS NULL
  `;

  return updated > 0;
};

export type DemoSourceRow = {
  personId: string;
  /** Профиль, чьи условия работы копируются. */
  profileId: string;
};

/**
 * Участник, у которого новый демо-водитель берёт условия работы профиля, — и больше ничего:
 * баланс у демо-водителя свой, фиксированный (решение Руслана 26-09-2026).
 *
 * Активная привязка, строка участия и работающий профиль; из таких — профиль, свежий по отметке
 * API. Демо-водители источником не бывают: копия копии уводила бы демо от живого парка.
 */
export const findDemoSource = async (client: Executor): Promise<DemoSourceRow | null> => {
  const rows = await client.$queryRaw<DemoSourceRow[]>`
    SELECT profile."person_id"  AS "personId",
           profile."profile_id" AS "profileId"
      FROM xb.park_profiles AS profile
      JOIN xb.persons AS person ON person."id" = profile."person_id"
      JOIN xb.person_settings AS settings ON settings."person_id" = person."id"
     WHERE profile."work_status" = 'working'
       AND NOT person."is_demo"
       AND EXISTS (
             SELECT 1
               FROM xb.telegram_links AS link
              WHERE link."person_id" = person."id"
                AND link."closed_at" IS NULL
           )
     ORDER BY profile."api_updated_at" DESC, profile."profile_id"
     LIMIT 1
  `;

  return rows[0] ?? null;
};

export const insertDemoPerson = async (client: Executor): Promise<string> => {
  const rows = await client.$queryRaw<{ id: string }[]>`
    INSERT INTO xb.persons ("is_demo")
    VALUES (true)
    RETURNING "id"
  `;

  const person = rows[0];

  if (!person) {
    throw new Error('вставка демо-водителя не вернула строку');
  }

  return person.id;
};

/** Источник удостоверения демо-водителя — рядом с `fleet_api`, `legacy_import`, `operator`. */
const DEMO_LICENSE_SOURCE = 'demo';

export const insertDemoLicense = async (
  personId: string,
  number: string,
  client: Executor,
): Promise<void> => {
  await client.$executeRaw`
    INSERT INTO xb.person_licenses ("person_id", "number_raw", "number_canonical", "source")
    VALUES (${personId}::uuid, ${number}, ${number}, ${DEMO_LICENSE_SOURCE})
  `;
};

export type DemoParkProfileInput = {
  personId: string;
  /** Профиль источника: из него берутся парк и условия работы. */
  sourceProfileId: string;
  firstName: string;
  callsign: string;
  now: Date;
};

/**
 * Профиль демо-водителя в парке. Из источника — только парк и условия работы: статус, тип
 * занятости, самозанятость, условие работы, текущий статус. Имя, позывной и машина свои:
 * всё, по чему узнаётся живой, здесь выдумано.
 *
 * Идентификатор — `demo-` и новый uuid: синхронизация такой профиль в ответе парка не увидит
 * никогда, а пропавших из ответа она не трогает (`syncRegistry.ts`). Отметки API — время прогона.
 */
export const insertDemoParkProfile = async (
  input: DemoParkProfileInput,
  client: Executor,
): Promise<string> => {
  const profileId = `demo-${randomUUID()}`;
  const now = input.now.toISOString();

  const inserted = await client.$executeRaw`
    INSERT INTO xb.park_profiles (
      "profile_id", "person_id", "park_id",
      "first_name", "last_name", "middle_name",
      "work_status", "employment_type", "is_selfemployed", "work_rule_id", "work_rule_name",
      "current_status",
      "callsign", "car_id", "car_number", "car_brand_model",
      "api_created_at", "api_modified_at", "api_updated_at", "last_synced_at"
    )
    SELECT ${profileId}, ${input.personId}::uuid, source."park_id",
           ${input.firstName}, '', NULL,
           source."work_status", source."employment_type", source."is_selfemployed",
           source."work_rule_id", source."work_rule_name",
           source."current_status",
           ${input.callsign}, NULL, NULL, NULL,
           ${now}::text::timestamptz, ${now}::text::timestamptz,
           ${now}::text::timestamptz, ${now}::text::timestamptz
      FROM xb.park_profiles AS source
     WHERE source."profile_id" = ${input.sourceProfileId}
  `;

  if (inserted === 0) {
    throw new Error(`профиля источника ${input.sourceProfileId} нет — копировать демо-водителю нечего`);
  }

  return profileId;
};

/**
 * Привязка демо-водителя к Telegram зрителя — обычная строка журнала привязок.
 *
 * Своим запросом, а не `insertTelegramLinks`: тот не заводит пару человек+чат, уже лежащую
 * в истории, а повторное внесение выключенного зрителя ровно это и делает — открывает новую
 * привязку рядом с закрытой. Одну активную на человека и на Telegram держат частичные
 * уникальные индексы, как у всех.
 */
export const insertDemoLink = async (
  personId: string,
  telegramUserId: bigint,
  client: Executor,
): Promise<void> => {
  await client.$executeRaw`
    INSERT INTO xb.telegram_links ("person_id", "telegram_chat_id", "telegram_user_id", "confirmed_by")
    VALUES (
      ${personId}::uuid,
      ${telegramUserId.toString()}::text::bigint,
      ${telegramUserId.toString()}::text::bigint,
      'demo'
    )
  `;
};

/** Закрывает активную привязку демо-водителя. Закрывать нечего — ноль. */
export const closeDemoLink = async (personId: string, closedAt: Date, client: Executor): Promise<number> =>
  client.$executeRaw`
    UPDATE xb.telegram_links
       SET "closed_at"    = ${closedAt.toISOString()}::text::timestamptz,
           "close_reason" = 'demo'
     WHERE "person_id" = ${personId}::uuid
       AND "closed_at" IS NULL
  `;

/** ДЕМО ОФИС — его заводит `make demo-create` вместе с демо-менеджером. */
export const findDemoOfficeId = async (client: Executor = db): Promise<string | null> => {
  const rows = await client.$queryRaw<{ id: string }[]>`
    SELECT "id"
      FROM xb.offices
     WHERE "is_demo"
     ORDER BY "created_at"
     LIMIT 1
  `;

  return rows[0]?.id ?? null;
};

// ---------------------------------------------------------------------------
// Признак демо у сущностей (issue #212)
// ---------------------------------------------------------------------------

/** Что бывает демо: у каждой из этих таблиц есть `is_demo`. */
export type DemoEntityKind =
  | 'product'
  | 'office'
  | 'mailing'
  | 'segment'
  | 'campaign'
  | 'employee'
  | 'person';

/**
 * Таблица на каждый вид — постоянной строкой, а не собранной из запроса: имя таблицы
 * параметром не передаётся, и выбирается оно здесь, кодом, из закрытого списка.
 */
const DEMO_TABLES = {
  product: Prisma.sql`xb.products`,
  office: Prisma.sql`xb.offices`,
  mailing: Prisma.sql`xb.mailings`,
  segment: Prisma.sql`xb.segments`,
  campaign: Prisma.sql`xb.campaigns`,
  employee: Prisma.sql`xb.employees`,
  person: Prisma.sql`xb.persons`,
} as const satisfies Record<DemoEntityKind, Prisma.Sql>;

/** Признак демо у сущности. Пусто — такой строки нет. */
export const findDemoFlag = async (
  kind: DemoEntityKind,
  id: string,
  client: Executor = db,
): Promise<boolean | null> => {
  const rows = await client.$queryRaw<{ isDemo: boolean }[]>`
    SELECT "is_demo" AS "isDemo"
      FROM ${DEMO_TABLES[kind]}
     WHERE "id" = ${id}::uuid
  `;

  return rows[0]?.isDemo ?? null;
};

// ---------------------------------------------------------------------------
// Раздел «Демо» (issue #252)
// ---------------------------------------------------------------------------

export type DemoViewerListRow = DemoViewerRow & {
  createdAt: Date;
};

/** Все зрители — действующие и выключенные, свежие первыми. */
export const listDemoViewers = async (client: Executor = db): Promise<DemoViewerListRow[]> =>
  client.$queryRaw<DemoViewerListRow[]>`
    SELECT ${DEMO_VIEWER_COLUMNS},
           "created_at" AS "createdAt"
      FROM xb.demo_viewers
     ORDER BY "created_at" DESC
  `;

export type DemoDriverListRow = {
  personId: string;
  firstName: string | null;
  lastName: string | null;
  callsign: string | null;
  /** Нет водительского счёта — пусто; у демо-водителя счёт заводится вместе с ним. */
  balance: bigint | null;
  programMember: boolean;
  lastTripAt: Date | null;
  /** Подпись зрителя. Пусто — водитель сгенерирован. */
  viewerLabel: string | null;
};

/**
 * Демо-водители раздела: все с `is_demo`, кроме спрятанных. Водители выключенных зрителей
 * тоже здесь — их прячет выключение от зрителя, а не от владельца.
 *
 * Профиль у демо-водителя один — заведённый вместе с ним, — и имя с позывным берутся из него.
 * Сначала водители зрителей, потом сгенерированные по времени заведения.
 */
export const listDemoDrivers = async (client: Executor = db): Promise<DemoDriverListRow[]> =>
  client.$queryRaw<DemoDriverListRow[]>`
    SELECT person."id"                         AS "personId",
           profile."first_name"                AS "firstName",
           profile."last_name"                 AS "lastName",
           profile."callsign",
           account."balance",
           (settings."person_id" IS NOT NULL)  AS "programMember",
           activity."lastTripAt",
           viewer."label"                      AS "viewerLabel"
      FROM xb.persons AS person
      LEFT JOIN LATERAL (
           SELECT candidate."first_name", candidate."last_name", candidate."callsign"
             FROM xb.park_profiles AS candidate
            WHERE candidate."person_id" = person."id"
            ORDER BY candidate."api_updated_at" DESC
            LIMIT 1
      ) AS profile ON TRUE
      LEFT JOIN LATERAL (
           SELECT max(trip."ended_at") AS "lastTripAt"
             FROM xb.trips AS trip
             JOIN xb.park_profiles AS candidate ON candidate."profile_id" = trip."profile_id"
            WHERE candidate."person_id" = person."id"
              AND trip."status" = ${COMPLETED_TRIP_STATUS}
      ) AS activity ON TRUE
      LEFT JOIN xb.person_settings AS settings ON settings."person_id" = person."id"
      LEFT JOIN xb.accounts AS account
             ON account."person_id" = person."id" AND account."type" = 'driver'
      LEFT JOIN xb.demo_viewers AS viewer ON viewer."person_id" = person."id"
     WHERE person."is_demo"
       AND person."demo_hidden_at" IS NULL
     ORDER BY (viewer."person_id" IS NULL), person."created_at", person."id"
  `;

export type DemoDriverLockRow = {
  isDemo: boolean;
  /** Водитель зрителя: есть строка `demo_viewers`. */
  hasViewer: boolean;
  hiddenAt: Date | null;
};

/** Человек под спрятать — с блокировкой строки. Пусто — такого нет. */
export const lockDemoDriver = async (personId: string, client: Executor): Promise<DemoDriverLockRow | null> => {
  const rows = await client.$queryRaw<DemoDriverLockRow[]>`
    SELECT person."is_demo"                           AS "isDemo",
           EXISTS (
             SELECT 1 FROM xb.demo_viewers AS viewer WHERE viewer."person_id" = person."id"
           )                                          AS "hasViewer",
           person."demo_hidden_at"                    AS "hiddenAt"
      FROM xb.persons AS person
     WHERE person."id" = ${personId}::uuid
       FOR UPDATE
  `;

  return rows[0] ?? null;
};

export const updateDemoDriverHidden = async (personId: string, hiddenAt: Date, client: Executor): Promise<void> => {
  await client.$executeRaw`
    UPDATE xb.persons
       SET "demo_hidden_at" = ${hiddenAt.toISOString()}::text::timestamptz,
           "updated_at"     = now()
     WHERE "id" = ${personId}::uuid
       AND "is_demo"
  `;
};

/**
 * Ключ блокировки нумерации сгенерированных. Постоянное число, а не имя: транзакционной
 * рекомендательной блокировке нужен `bigint`, и выбирается он здесь один раз.
 */
const DEMO_GENERATOR_LOCK_KEY = 252_000_001;

/**
 * Нумерация генератора — по одному: два прогона генератора разом иначе оба прочитали бы
 * один наибольший номер и завели двух «ДЕМО ВОДИТЕЛЬ 7». Держится до конца транзакции.
 */
export const lockDemoGenerator = async (client: Executor): Promise<void> => {
  await client.$executeRaw`SELECT pg_advisory_xact_lock(${DEMO_GENERATOR_LOCK_KEY}::bigint)`;
};

/**
 * Наибольший номер среди сгенерированных — включая спрятанных: номер спрятанного второму
 * не достаётся. Сгенерированный — демо-водитель без строки `demo_viewers`; номер — из имени
 * профиля `<префикс> <N>`. Ни одного — ноль.
 */
export const findMaxGeneratedDemoNumber = async (namePrefix: string, client: Executor): Promise<number> => {
  const rows = await client.$queryRaw<{ maximum: number | null }[]>`
    SELECT max(substring(profile."first_name" FROM '[0-9]+$')::int) AS "maximum"
      FROM xb.park_profiles AS profile
      JOIN xb.persons AS person ON person."id" = profile."person_id"
     WHERE person."is_demo"
       AND NOT EXISTS (
             SELECT 1 FROM xb.demo_viewers AS viewer WHERE viewer."person_id" = person."id"
           )
       AND profile."first_name" LIKE ${`${namePrefix} %`}
       AND profile."first_name" ~ '[0-9]+$'
  `;

  return rows[0]?.maximum ?? 0;
};

export type DemoNamedRow = {
  id: string;
  /** Название: у товара, рассылки и акции пусто бывает только у черновика. */
  name: string | null;
};

/** Демо-офисы — работающие первыми, как в общем списке. */
export const listDemoOffices = async (client: Executor = db): Promise<{ id: string; name: string }[]> =>
  client.$queryRaw<{ id: string; name: string }[]>`
    SELECT "id", "name"
      FROM xb.offices
     WHERE "is_demo"
     ORDER BY ("archived_at" IS NOT NULL), "name"
  `;

export type DemoEntitiesRows = {
  products: DemoNamedRow[];
  mailings: DemoNamedRow[];
  segments: DemoNamedRow[];
  campaigns: DemoNamedRow[];
};

/** Демо-товары, рассылки, сегменты и акции — свежие первыми, архивные тоже: сводка, а не выбор. */
export const listDemoEntities = async (client: Executor = db): Promise<DemoEntitiesRows> => {
  const [products, mailings, segments, campaigns] = await Promise.all([
    client.$queryRaw<DemoNamedRow[]>`
      SELECT "id", "name" FROM xb.products WHERE "is_demo" ORDER BY "created_at" DESC
    `,
    client.$queryRaw<DemoNamedRow[]>`
      SELECT "id", "title" AS "name" FROM xb.mailings WHERE "is_demo" ORDER BY "created_at" DESC
    `,
    client.$queryRaw<DemoNamedRow[]>`
      SELECT "id", "name" FROM xb.segments WHERE "is_demo" ORDER BY "created_at" DESC
    `,
    client.$queryRaw<DemoNamedRow[]>`
      SELECT "id", "title" AS "name" FROM xb.campaigns WHERE "is_demo" ORDER BY "created_at" DESC
    `,
  ]);

  return { products, mailings, segments, campaigns };
};
