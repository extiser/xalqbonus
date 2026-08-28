import { randomUUID } from 'node:crypto';

import { db } from '#server/db';

/**
 * Доступ к реестру парка: люди, удостоверения, профили, телефоны, журнал трудоустройства.
 *
 * Единственный слой, которому разрешено знать Prisma (docs/principles.md). Про Fleet API
 * не знает ничего: разбор выгрузки живёт в адаптере и приходит сюда уже разложенным
 * по полям.
 *
 * Запись идёт пачками сырым SQL через `unnest`: 25 390 профилей по одному запросу
 * на строку — это 25 390 круговых обходов, а `ON CONFLICT` с частичным индексом
 * типизированным API Prisma всё равно не выражается. Схема в сыром SQL указывается
 * явно — у сырого соединения `search_path` дефолтный, и запрос без префикса молча ушёл
 * бы в `public` (docs/decisions.md → «В сыром SQL схема указывается явно»).
 */

/** Сколько строк уходит в базу одним запросом. */
const CHUNK_SIZE = 1_000;

/**
 * Дата уходит в базу текстом ISO с явным приведением на месте.
 *
 * Массив объектов `Date` драйвер типизирует по своему усмотрению, и приведение целого
 * массива к `date[]` начинает зависеть от того, как он угадал. Текст читается одинаково
 * всегда — тот же приём, что с суммами в repositories/points.ts.
 */
const asTimestampLiteral = (value: Date | null): string | null => value?.toISOString() ?? null;

const chunked = <Item>(items: readonly Item[]): Item[][] => {
  const chunks: Item[][] = [];

  for (let offset = 0; offset < items.length; offset += CHUNK_SIZE) {
    chunks.push(items.slice(offset, offset + CHUNK_SIZE));
  }

  return chunks;
};

export type PersonLicenseInput = {
  /** Канонический номер: ключ человека. Считается `server/utils/licenseNumber.ts`. */
  numberCanonical: string;
  numberRaw: string;
  country: string | null;
  issueDate: Date | null;
  expirationDate: Date | null;
};

/**
 * Читает соответствие «активный канонический номер → человек».
 *
 * Это и есть якорь идемпотентности первого шага переноса: повторный прогон находит
 * заведённых людей здесь и вторых не создаёт. Опора именно на активную строку журнала
 * удостоверений, а не на отдельную таблицу соответствий, — потому что номер хранится
 * в одном месте (docs/decisions.md).
 */
export const readPersonIdsByActiveLicense = async (): Promise<Map<string, string>> => {
  const rows = await db.$queryRaw<{ numberCanonical: string; personId: string }[]>`
    SELECT "number_canonical" AS "numberCanonical", "person_id" AS "personId"
      FROM xb.person_licenses
     WHERE "closed_at" IS NULL
  `;

  return new Map(rows.map((row) => [row.numberCanonical, row.personId]));
};

/**
 * Заводит людей, которых ещё нет, — по одному на канонический номер.
 *
 * Человек и его активное удостоверение появляются в одной транзакции: человек без
 * удостоверения не опознаётся ничем, и найти его повторный прогон уже не сможет.
 * Возвращает полное соответствие «номер → человек», включая тех, кто был раньше.
 */
export const ensurePersonsForLicenses = async (
  licenses: readonly PersonLicenseInput[],
  source: string,
): Promise<Map<string, string>> => {
  const known = await readPersonIdsByActiveLicense();
  const missing = licenses.filter((license) => !known.has(license.numberCanonical));

  for (const chunk of chunked(missing)) {
    const personIds = chunk.map(() => randomUUID());

    await db.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        INSERT INTO xb.persons ("id")
        SELECT unnest(${personIds}::uuid[])
      `;

      await transaction.$executeRaw`
        INSERT INTO xb.person_licenses (
          "person_id", "number_raw", "number_canonical",
          "country", "issue_date", "expiration_date", "source"
        )
        SELECT * FROM unnest(
          ${personIds}::uuid[],
          ${chunk.map((license) => license.numberRaw)}::text[],
          ${chunk.map((license) => license.numberCanonical)}::text[],
          ${chunk.map((license) => license.country)}::text[],
          ${chunk.map((license) => asTimestampLiteral(license.issueDate))}::text[]::date[],
          ${chunk.map((license) => asTimestampLiteral(license.expirationDate))}::text[]::date[],
          ${chunk.map(() => source)}::text[]
        )
      `;
    });

    for (const [index, license] of chunk.entries()) {
      // Позиции совпадают: `personIds` построен по этому же массиву и в этом же порядке.
      known.set(license.numberCanonical, personIds[index] as string);
    }
  }

  return known;
};

export type ParkProfileInput = {
  profileId: string;
  personId: string;
  parkId: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  workStatus: string;
  employmentType: string;
  isSelfemployed: boolean;
  workRuleId: string;
  hireDate: Date | null;
  fireDate: Date | null;
  currentStatus: string;
  currentStatusUpdatedAt: Date | null;
  callsign: string | null;
  carId: string | null;
  carNumber: string | null;
  carBrandModel: string | null;
  apiCreatedAt: Date;
  apiModifiedAt: Date;
  apiUpdatedAt: Date;
};

/**
 * Кладёт профили парка: новые вставляет, существующие обновляет по `profile_id`.
 *
 * `first_seen_at` при обновлении не трогается — это дата, когда парк впервые показал
 * нам этот профиль, и переписывать её каждым прогоном значит потерять её насовсем.
 */
export const upsertParkProfiles = async (
  profiles: readonly ParkProfileInput[],
  syncedAt: Date,
): Promise<void> => {
  for (const chunk of chunked(profiles)) {
    await db.$executeRaw`
      INSERT INTO xb.park_profiles (
        "profile_id", "person_id", "park_id",
        "first_name", "last_name", "middle_name",
        "work_status", "employment_type", "is_selfemployed", "work_rule_id",
        "hire_date", "fire_date",
        "current_status", "current_status_updated_at",
        "callsign", "car_id", "car_number", "car_brand_model",
        "api_created_at", "api_modified_at", "api_updated_at", "last_synced_at"
      )
      SELECT * FROM unnest(
        ${chunk.map((profile) => profile.profileId)}::text[],
        ${chunk.map((profile) => profile.personId)}::uuid[],
        ${chunk.map((profile) => profile.parkId)}::text[],
        ${chunk.map((profile) => profile.firstName)}::text[],
        ${chunk.map((profile) => profile.lastName)}::text[],
        ${chunk.map((profile) => profile.middleName)}::text[],
        ${chunk.map((profile) => profile.workStatus)}::text[],
        ${chunk.map((profile) => profile.employmentType)}::text[],
        ${chunk.map((profile) => String(profile.isSelfemployed))}::text[]::boolean[],
        ${chunk.map((profile) => profile.workRuleId)}::text[],
        ${chunk.map((profile) => asTimestampLiteral(profile.hireDate))}::text[]::date[],
        ${chunk.map((profile) => asTimestampLiteral(profile.fireDate))}::text[]::date[],
        ${chunk.map((profile) => profile.currentStatus)}::text[],
        ${chunk.map((profile) => asTimestampLiteral(profile.currentStatusUpdatedAt))}::text[]::timestamptz[],
        ${chunk.map((profile) => profile.callsign)}::text[],
        ${chunk.map((profile) => profile.carId)}::text[],
        ${chunk.map((profile) => profile.carNumber)}::text[],
        ${chunk.map((profile) => profile.carBrandModel)}::text[],
        ${chunk.map((profile) => asTimestampLiteral(profile.apiCreatedAt))}::text[]::timestamptz[],
        ${chunk.map((profile) => asTimestampLiteral(profile.apiModifiedAt))}::text[]::timestamptz[],
        ${chunk.map((profile) => asTimestampLiteral(profile.apiUpdatedAt))}::text[]::timestamptz[],
        ${chunk.map(() => asTimestampLiteral(syncedAt))}::text[]::timestamptz[]
      )
      ON CONFLICT ("profile_id") DO UPDATE SET
        "person_id"                = EXCLUDED."person_id",
        "park_id"                  = EXCLUDED."park_id",
        "first_name"               = EXCLUDED."first_name",
        "last_name"                = EXCLUDED."last_name",
        "middle_name"              = EXCLUDED."middle_name",
        "work_status"              = EXCLUDED."work_status",
        "employment_type"          = EXCLUDED."employment_type",
        "is_selfemployed"          = EXCLUDED."is_selfemployed",
        "work_rule_id"             = EXCLUDED."work_rule_id",
        "hire_date"                = EXCLUDED."hire_date",
        "fire_date"                = EXCLUDED."fire_date",
        "current_status"           = EXCLUDED."current_status",
        "current_status_updated_at" = EXCLUDED."current_status_updated_at",
        "callsign"                 = EXCLUDED."callsign",
        "car_id"                   = EXCLUDED."car_id",
        "car_number"               = EXCLUDED."car_number",
        "car_brand_model"          = EXCLUDED."car_brand_model",
        "api_created_at"           = EXCLUDED."api_created_at",
        "api_modified_at"          = EXCLUDED."api_modified_at",
        "api_updated_at"           = EXCLUDED."api_updated_at",
        "last_synced_at"           = EXCLUDED."last_synced_at"
    `;
  }
};

export type ProfilePhoneInput = {
  profileId: string;
  phoneRaw: string;
  /** Заполняется только для формы `+998XXXXXXXXX`: по нему идёт автопривязка Telegram. */
  phoneE164: string | null;
};

/**
 * Кладёт телефоны профилей активными строками.
 *
 * Повтор отбивается частичным уникальным индексом `profile_phones_active_raw_key`,
 * а не проверкой «есть ли уже такой»: ограничение не забывают и не обходят
 * при рефакторинге (docs/principles.md → «Идемпотентность вместо аккуратности»).
 *
 * Закрытием исчезнувших номеров занимается синхронизация профилей, а не перенос:
 * разовая заливка видит один снимок парка и сравнивать ей не с чем.
 */
export const insertActiveProfilePhones = async (
  phones: readonly ProfilePhoneInput[],
): Promise<void> => {
  for (const chunk of chunked(phones)) {
    await db.$executeRaw`
      INSERT INTO xb.profile_phones ("profile_id", "phone_raw", "phone_e164")
      SELECT * FROM unnest(
        ${chunk.map((phone) => phone.profileId)}::text[],
        ${chunk.map((phone) => phone.phoneRaw)}::text[],
        ${chunk.map((phone) => phone.phoneE164)}::text[]
      )
      ON CONFLICT ("profile_id", "phone_raw") WHERE "closed_at" IS NULL DO NOTHING
    `;
  }
};

export type ProfileStatusEventInput = {
  profileId: string;
  statusTo: string;
};

/**
 * Пишет первую запись журнала трудоустройства: `status_from IS NULL` и текущий статус.
 *
 * Только тем профилям, у которых журнал пуст. Переходы `working → fired` пишет
 * синхронизация — у неё есть с чем сравнивать, у разовой заливки нет.
 */
export const insertInitialStatusEvents = async (
  events: readonly ProfileStatusEventInput[],
): Promise<number> => {
  let written = 0;

  for (const chunk of chunked(events)) {
    written += await db.$executeRaw`
      INSERT INTO xb.profile_status_events ("profile_id", "status_from", "status_to")
      SELECT incoming."profile_id", NULL, incoming."status_to"
        FROM unnest(
               ${chunk.map((event) => event.profileId)}::text[],
               ${chunk.map((event) => event.statusTo)}::text[]
             ) AS incoming("profile_id", "status_to")
       WHERE NOT EXISTS (
             SELECT 1 FROM xb.profile_status_events AS existing
              WHERE existing."profile_id" = incoming."profile_id"
       )
    `;
  }

  return written;
};

export type ProfileOwnerRow = { profileId: string; personId: string };

/** Читает соответствие «профиль парка → человек» для перечисленных профилей. */
export const readProfileOwners = async (
  profileIds: readonly string[],
): Promise<Map<string, string>> => {
  const rows = await db.$queryRaw<ProfileOwnerRow[]>`
    SELECT "profile_id" AS "profileId", "person_id" AS "personId"
      FROM xb.park_profiles
     WHERE "profile_id" = ANY(${profileIds}::text[])
  `;

  return new Map(rows.map((row) => [row.profileId, row.personId]));
};

/** Сколько канонических номеров принадлежит более чем одному профилю парка. */
export const countPersonsWithSeveralProfiles = async (): Promise<number> => {
  const rows = await db.$queryRaw<{ total: bigint }[]>`
    SELECT COUNT(*) AS total
      FROM (
        SELECT "person_id"
          FROM xb.park_profiles
         GROUP BY "person_id"
        HAVING COUNT(*) > 1
      ) AS several
  `;

  return Number(rows[0]?.total ?? 0n);
};

export type RegistryCounts = {
  persons: number;
  parkProfiles: number;
  personLicenses: number;
  profilePhones: number;
  profileStatusEvents: number;
  personSettings: number;
};

/** Что реально лежит в базе после прогона. Отчёт считает по базе, а не по своим счётчикам. */
export const readRegistryCounts = async (): Promise<RegistryCounts> => {
  const rows = await db.$queryRaw<
    {
      persons: bigint;
      parkProfiles: bigint;
      personLicenses: bigint;
      profilePhones: bigint;
      profileStatusEvents: bigint;
      personSettings: bigint;
    }[]
  >`
    SELECT (SELECT COUNT(*) FROM xb.persons)               AS "persons",
           (SELECT COUNT(*) FROM xb.park_profiles)         AS "parkProfiles",
           (SELECT COUNT(*) FROM xb.person_licenses)       AS "personLicenses",
           (SELECT COUNT(*) FROM xb.profile_phones)        AS "profilePhones",
           (SELECT COUNT(*) FROM xb.profile_status_events) AS "profileStatusEvents",
           (SELECT COUNT(*) FROM xb.person_settings)       AS "personSettings"
  `;

  const row = rows[0];

  return {
    persons: Number(row?.persons ?? 0n),
    parkProfiles: Number(row?.parkProfiles ?? 0n),
    personLicenses: Number(row?.personLicenses ?? 0n),
    profilePhones: Number(row?.profilePhones ?? 0n),
    profileStatusEvents: Number(row?.profileStatusEvents ?? 0n),
    personSettings: Number(row?.personSettings ?? 0n),
  };
};
