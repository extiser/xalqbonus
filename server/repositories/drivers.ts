import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';
import type { Language, LinkCloseReason, LinkConfirmedBy } from '#server/generated/prisma/enums';

/**
 * Чтение реестра парка под экран водителя: поиск по всему реестру и всё, из чего
 * складывается карточка.
 *
 * Ищем по реестру, а не по участникам программы: в базе два разных множества — около
 * 24 700 человек парка и около 4 000 участников, и на «такого нет» иначе непонятно, нет
 * его в парке или он просто не зарегистрирован. Это разные ответы и разные действия
 * (issue #35).
 *
 * Схема в сыром SQL указывается явно — `xb.persons`, а не `persons`: у соединения
 * драйверного адаптера `search_path` остаётся дефолтным, и запрос без префикса молча ушёл
 * бы в `public`, которая принадлежит старому боту (docs/decisions.md).
 *
 * Календарные даты забираются текстом — `"hire_date"::text`. Колонка `date` не знает
 * ни времени, ни зоны; превращённая в момент, она сдвигается на зону контейнера и может
 * показать соседний день. Дата приёма на работу, разъезжающаяся с окружением, —
 * ровно то, из-за чего экрану перестают верить.
 */

export type DriverSearchCriteria = {
  /** Нормализованный номер ВУ. Пусто, если из запроса номера не получилось. */
  licenseCanonical: string | null;
  /** Цифры телефона. Пусто, если цифр в запросе слишком мало для осмысленного поиска. */
  phoneDigits: string | null;
  /** Слова имени. Пусто, если искать по имени нечего. */
  nameTerms: string[];
};

/**
 * Люди, подходящие под запрос, — тремя ветками, объединёнными `UNION`.
 *
 * Одно поле ввода на три признака намеренно: оператор не знает заранее, что ему диктуют —
 * номер, телефон или фамилию, и заставлять его выбирать вкладку значит терять время
 * на каждом водителе.
 *
 * Номер ищется по нормализованному значению: `number_canonical` для того и заведён, что
 * один и тот же номер лежит в реестре в двух написаниях — с префиксом `UZ` и без него,
 * а водитель диктует его как попало (docs/drivers.md).
 *
 * Незаданная ветка отключается сравнением `IS NOT NULL` на самом параметре, а не сборкой
 * строки запроса из кусков: собранный конкатенацией SQL — это то место, где однажды
 * оказывается пользовательский ввод.
 */
const matchedPersons = (criteria: DriverSearchCriteria): Prisma.Sql => Prisma.sql`
  SELECT license."person_id" AS "personId"
    FROM xb.person_licenses AS license
   WHERE ${criteria.licenseCanonical}::text IS NOT NULL
     AND license."number_canonical" = ${criteria.licenseCanonical}
   UNION
  SELECT profile."person_id" AS "personId"
    FROM xb.profile_phones AS phone
    JOIN xb.park_profiles AS profile ON profile."profile_id" = phone."profile_id"
   WHERE ${criteria.phoneDigits}::text IS NOT NULL
     -- Совпадение по хвосту: в реестре номер лежит с кодом страны, а диктуют его чаще
     -- девятью цифрами. Класс символов, а не сокращение регулярного выражения: обратный
     -- слэш внутри шаблонной строки JavaScript до Postgres не доезжает.
     AND regexp_replace(phone."phone_raw", '[^0-9]', '', 'g') LIKE '%' || ${criteria.phoneDigits}
   UNION
  SELECT profile."person_id" AS "personId"
    FROM xb.park_profiles AS profile
   WHERE cardinality(${criteria.nameTerms}::text[]) > 0
     -- Все слова запроса, в любом порядке: «Иванов Иван» и «Иван Иванов» — один человек.
     AND (
       SELECT bool_and(
         concat_ws(' ', profile."last_name", profile."first_name", profile."middle_name")
           ILIKE '%' || term || '%'
       )
         FROM unnest(${criteria.nameTerms}::text[]) AS term
     )
`;

export type DriverSearchListRow = {
  personId: string;
  lastName: string | null;
  firstName: string | null;
  middleName: string | null;
  licenseNumberRaw: string | null;
  licenseNumberCanonical: string | null;
  phones: string[];
  workStatuses: string[];
  profilesCount: number;
  isMember: boolean;
  balance: bigint | null;
};

/**
 * Страница результатов поиска.
 *
 * Постранично, а не целиком: под пустой запрос иначе уехал бы весь реестр парка одним
 * ответом. Порядок — участники первыми, дальше по фамилии; человек добавляется в конец
 * списка своим идентификатором, иначе две страницы одного запроса могут показать
 * одну и ту же строку дважды.
 */
export const listMatchedDrivers = async (
  criteria: DriverSearchCriteria,
  limit: number,
  offset: number,
): Promise<DriverSearchListRow[]> =>
  db.$queryRaw<DriverSearchListRow[]>`
    WITH matched AS (${matchedPersons(criteria)})
    SELECT person."id"                          AS "personId",
           profile."lastName",
           profile."firstName",
           profile."middleName",
           license."numberRaw"                  AS "licenseNumberRaw",
           license."numberCanonical"            AS "licenseNumberCanonical",
           phones."phones",
           profiles."workStatuses",
           profiles."profilesCount",
           (settings."person_id" IS NOT NULL)   AS "isMember",
           account."balance"
      FROM matched
      JOIN xb.persons AS person ON person."id" = matched."personId"
      -- Профиль для показа — один из нескольких: работающий важнее уволенного, среди
      -- равных берётся свежий по отметке API. Все профили показывает карточка.
      LEFT JOIN LATERAL (
        SELECT candidate."last_name"   AS "lastName",
               candidate."first_name"  AS "firstName",
               candidate."middle_name" AS "middleName"
          FROM xb.park_profiles AS candidate
         WHERE candidate."person_id" = person."id"
         ORDER BY (candidate."work_status" = 'working') DESC, candidate."api_updated_at" DESC
         LIMIT 1
      ) AS profile ON TRUE
      LEFT JOIN LATERAL (
        SELECT candidate."number_raw"       AS "numberRaw",
               candidate."number_canonical" AS "numberCanonical"
          FROM xb.person_licenses AS candidate
         WHERE candidate."person_id" = person."id" AND candidate."closed_at" IS NULL
         ORDER BY candidate."observed_at" DESC
         LIMIT 1
      ) AS license ON TRUE
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS "profilesCount",
               coalesce(array_agg(DISTINCT candidate."work_status"), ARRAY[]::text[])
                 AS "workStatuses"
          FROM xb.park_profiles AS candidate
         WHERE candidate."person_id" = person."id"
      ) AS profiles ON TRUE
      LEFT JOIN LATERAL (
        SELECT coalesce(array_agg(DISTINCT phone."phone_raw"), ARRAY[]::text[]) AS "phones"
          FROM xb.profile_phones AS phone
          JOIN xb.park_profiles AS candidate ON candidate."profile_id" = phone."profile_id"
         WHERE candidate."person_id" = person."id" AND phone."closed_at" IS NULL
      ) AS phones ON TRUE
      LEFT JOIN xb.person_settings AS settings ON settings."person_id" = person."id"
      LEFT JOIN xb.accounts AS account
             ON account."person_id" = person."id" AND account."type" = 'driver'
     ORDER BY (settings."person_id" IS NOT NULL) DESC,
              profile."lastName" ASC NULLS LAST,
              profile."firstName" ASC NULLS LAST,
              person."id" ASC
     LIMIT ${limit} OFFSET ${offset}
  `;

export const countMatchedDrivers = async (criteria: DriverSearchCriteria): Promise<number> => {
  const rows = await db.$queryRaw<{ total: number }[]>`
    SELECT count(*)::int AS "total" FROM (${matchedPersons(criteria)}) AS matched
  `;

  return rows[0]?.total ?? 0;
};

export type PersonRow = {
  personId: string;
  createdAt: Date;
};

export const findPerson = async (personId: string): Promise<PersonRow | null> => {
  const rows = await db.$queryRaw<PersonRow[]>`
    SELECT "id" AS "personId", "created_at" AS "createdAt"
      FROM xb.persons
     WHERE "id" = ${personId}::uuid
  `;

  return rows[0] ?? null;
};

export type PersonLicenseRow = {
  numberRaw: string;
  numberCanonical: string;
  country: string | null;
  issueDate: string | null;
  expirationDate: string | null;
  observedAt: Date;
  closedAt: Date | null;
  source: string;
};

/**
 * Номера ВУ человека: действующий и прежние.
 *
 * Прежние показываются вместе с действующим намеренно: при перевыпуске номер меняется —
 * у 171 пары из проверенных он разошёлся, — и вопрос «почему баланс тут» без истории
 * номеров ответа не имеет.
 */
export const listPersonLicenses = async (personId: string): Promise<PersonLicenseRow[]> =>
  db.$queryRaw<PersonLicenseRow[]>`
    SELECT "number_raw"       AS "numberRaw",
           "number_canonical" AS "numberCanonical",
           "country",
           "issue_date"::text      AS "issueDate",
           "expiration_date"::text AS "expirationDate",
           "observed_at"      AS "observedAt",
           "closed_at"        AS "closedAt",
           "source"
      FROM xb.person_licenses
     WHERE "person_id" = ${personId}::uuid
     ORDER BY "closed_at" ASC NULLS FIRST, "observed_at" DESC
  `;

export type ParkProfileRow = {
  profileId: string;
  parkId: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  workStatus: string;
  employmentType: string;
  workRuleName: string | null;
  hireDate: string | null;
  fireDate: string | null;
  currentStatus: string;
  currentStatusUpdatedAt: Date | null;
  callsign: string | null;
  carNumber: string | null;
  carBrandModel: string | null;
  firstSeenAt: Date;
  lastSyncedAt: Date;
  tripsTotal: number;
  lastTripEndedAt: Date | null;
};

/**
 * Все учётки человека в парке.
 *
 * Именно все: несколько профилей у одного человека — не служебная деталь, а то,
 * из чего складывается один баланс. Увольнение и заведение заново дают второй
 * `profile_id` на том же номере ВУ, и поездки при этом писались на оба
 * (docs/drivers.md).
 */
export const listPersonParkProfiles = async (personId: string): Promise<ParkProfileRow[]> =>
  db.$queryRaw<ParkProfileRow[]>`
    SELECT profile."profile_id"      AS "profileId",
           profile."park_id"         AS "parkId",
           profile."first_name"      AS "firstName",
           profile."last_name"       AS "lastName",
           profile."middle_name"     AS "middleName",
           profile."work_status"     AS "workStatus",
           profile."employment_type" AS "employmentType",
           profile."work_rule_name"  AS "workRuleName",
           profile."hire_date"::text AS "hireDate",
           profile."fire_date"::text AS "fireDate",
           profile."current_status"  AS "currentStatus",
           profile."current_status_updated_at" AS "currentStatusUpdatedAt",
           profile."callsign",
           profile."car_number"      AS "carNumber",
           profile."car_brand_model" AS "carBrandModel",
           profile."first_seen_at"   AS "firstSeenAt",
           profile."last_synced_at"  AS "lastSyncedAt",
           trips."tripsTotal",
           trips."lastTripEndedAt"
      FROM xb.park_profiles AS profile
      LEFT JOIN LATERAL (
        SELECT count(*)::int      AS "tripsTotal",
               max(trip."ended_at") AS "lastTripEndedAt"
          FROM xb.trips AS trip
         WHERE trip."profile_id" = profile."profile_id"
      ) AS trips ON TRUE
     WHERE profile."person_id" = ${personId}::uuid
     ORDER BY (profile."work_status" = 'working') DESC, profile."api_updated_at" DESC
  `;

export type ProfilePhoneRow = {
  profileId: string;
  phoneRaw: string;
  phoneE164: string | null;
  observedAt: Date;
  closedAt: Date | null;
};

/** Телефоны всех профилей человека, включая закрытые: канал связи меняется часто. */
export const listPersonPhones = async (personId: string): Promise<ProfilePhoneRow[]> =>
  db.$queryRaw<ProfilePhoneRow[]>`
    SELECT phone."profile_id" AS "profileId",
           phone."phone_raw"  AS "phoneRaw",
           phone."phone_e164" AS "phoneE164",
           phone."observed_at" AS "observedAt",
           phone."closed_at"  AS "closedAt"
      FROM xb.profile_phones AS phone
      JOIN xb.park_profiles AS profile ON profile."profile_id" = phone."profile_id"
     WHERE profile."person_id" = ${personId}::uuid
     ORDER BY phone."closed_at" ASC NULLS FIRST, phone."observed_at" DESC
  `;

export type TelegramLinkRow = {
  telegramChatId: string;
  telegramUserId: string | null;
  linkedAt: Date;
  closedAt: Date | null;
  closeReason: LinkCloseReason | null;
  confirmedBy: LinkConfirmedBy;
  operatorRef: string | null;
};

/**
 * Привязки Telegram человека, действующая первой.
 *
 * Закрытые остаются в списке: перепривязка — закрытие прежней строки и новая рядом,
 * а не правка на месте, и вопрос «кто и когда сидел на этом аккаунте» должен иметь ответ
 * через год (docs/drivers.md).
 *
 * `chat_id` уходит текстом: в базе он `bigint`, а таких чисел JSON не знает.
 */
export const listPersonTelegramLinks = async (personId: string): Promise<TelegramLinkRow[]> =>
  db.$queryRaw<TelegramLinkRow[]>`
    SELECT "telegram_chat_id"::text AS "telegramChatId",
           "telegram_user_id"::text AS "telegramUserId",
           "linked_at"    AS "linkedAt",
           "closed_at"    AS "closedAt",
           "close_reason" AS "closeReason",
           "confirmed_by" AS "confirmedBy",
           "operator_ref" AS "operatorRef"
      FROM xb.telegram_links
     WHERE "person_id" = ${personId}::uuid
     ORDER BY "closed_at" ASC NULLS FIRST, "linked_at" DESC
  `;

export type PersonSettingsRow = {
  joinedAt: Date;
  joinedSource: string;
  language: Language;
  notificationsEnabled: boolean;
};

/**
 * Участие в программе. Пусто у человека, который парку известен, а в программе
 * не состоит: граница проходит по наличию этой строки (docs/drivers.md).
 */
export const findPersonSettings = async (personId: string): Promise<PersonSettingsRow | null> => {
  const rows = await db.$queryRaw<PersonSettingsRow[]>`
    SELECT "joined_at"     AS "joinedAt",
           "joined_source" AS "joinedSource",
           "language",
           "notifications_enabled" AS "notificationsEnabled"
      FROM xb.person_settings
     WHERE "person_id" = ${personId}::uuid
  `;

  return rows[0] ?? null;
};
