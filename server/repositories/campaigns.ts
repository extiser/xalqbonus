import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';
import type {
  CampaignHalfCode,
  CampaignParticipantOutcome,
  CampaignParticipantState,
  CampaignStatus,
} from '#server/generated/prisma/enums';
import { segmentMembersSql } from '#server/repositories/segments';
import { parkDaySql, parkDayStartSql } from '#server/utils/parkDaySql';
import { COMPLETED_TRIP_STATUS } from '#server/utils/tripStatus';
import type { SegmentConditions } from '#shared/types/segment';

/**
 * Акции, окна их половин и снимок участников (issue #166).
 *
 * Схема в сыром SQL указывается явно — `xb.campaigns`, а не `campaigns`
 * (docs/decisions.md → «В сыром SQL схема указывается явно»).
 *
 * Переходы — статуса акции и состояния участника — пишутся условием на прежнее значение
 * внутри `UPDATE`, а не проверкой перед ним: два нажатия подряд обязаны дать один переход,
 * и решает это база (docs/principles.md → «Идемпотентность вместо аккуратности»).
 *
 * Окно хранится метками начала суток механики, а на экран уезжает ещё и датами. Перевод
 * в обе стороны — здесь, одним выражением (`parkDaySql`, `parkDayStartSql`): второй перевод
 * где-нибудь в коде однажды резал бы сутки по полуночи.
 */

type Executor = Prisma.TransactionClient;

/** Окно половины из базы. Даты — `YYYY-MM-DD` в сутках парка, последний день включительно. */
export type CampaignWindowRow = {
  startsAt: Date | null;
  endsAt: Date | null;
  startsOn: string | null;
  endsOn: string | null;
};

export type CampaignRow = {
  id: string;
  slug: string | null;
  title: string | null;
  status: CampaignStatus;
  /** Демо-акция (issue #212): на демо-сегменте и с ДЕМО ОФИСОМ. */
  isDemo: boolean;
  segmentId: string | null;
  segmentName: string | null;
  segmentArchivedAt: Date | null;
  splitEnabled: boolean;
  audienceSize: number | null;
  officeId: string | null;
  officeName: string | null;
  officeArchivedAt: Date | null;
  rewardLifetimeDays: number | null;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
  launchedAt: Date | null;
  halfA: CampaignWindowRow;
  /** Пусто, если строки половины Б нет: без деления её не заводят. */
  halfB: CampaignWindowRow | null;
};

type CampaignFlatRow = Omit<CampaignRow, 'halfA' | 'halfB'> & {
  hasHalfB: boolean;
  halfAStartsAt: Date | null;
  halfAEndsAt: Date | null;
  halfAStartsOn: string | null;
  halfAEndsOn: string | null;
  halfBStartsAt: Date | null;
  halfBEndsAt: Date | null;
  halfBStartsOn: string | null;
  halfBEndsOn: string | null;
};

/** Дата начала окна — сутки парка, в которые попадает метка начала. */
const startsOnSql = (column: Prisma.Sql): Prisma.Sql =>
  Prisma.sql`to_char(${parkDaySql(column)}, 'YYYY-MM-DD')`;

/**
 * Дата последнего дня окна. Метка конца — начало суток, следующих за последним днём,
 * поэтому день на единицу раньше.
 */
const endsOnSql = (column: Prisma.Sql): Prisma.Sql =>
  Prisma.sql`to_char(${parkDaySql(column)} - 1, 'YYYY-MM-DD')`;

const CAMPAIGN_SELECT = Prisma.sql`
  SELECT campaign."id",
         campaign."slug",
         campaign."title",
         campaign."status",
         campaign."is_demo"        AS "isDemo",
         campaign."segment_id"     AS "segmentId",
         segment."name"            AS "segmentName",
         segment."archived_at"     AS "segmentArchivedAt",
         campaign."split_enabled"  AS "splitEnabled",
         campaign."audience_size"  AS "audienceSize",
         campaign."office_id"      AS "officeId",
         office."name"             AS "officeName",
         office."archived_at"      AS "officeArchivedAt",
         campaign."reward_lifetime_days" AS "rewardLifetimeDays",
         author."full_name"        AS "createdByName",
         campaign."created_at"     AS "createdAt",
         campaign."updated_at"     AS "updatedAt",
         campaign."launched_at"    AS "launchedAt",
         half_a."starts_at"        AS "halfAStartsAt",
         half_a."ends_at"          AS "halfAEndsAt",
         ${startsOnSql(Prisma.sql`half_a."starts_at"`)} AS "halfAStartsOn",
         ${endsOnSql(Prisma.sql`half_a."ends_at"`)}     AS "halfAEndsOn",
         (half_b."campaign_id" IS NOT NULL)             AS "hasHalfB",
         half_b."starts_at"        AS "halfBStartsAt",
         half_b."ends_at"          AS "halfBEndsAt",
         ${startsOnSql(Prisma.sql`half_b."starts_at"`)} AS "halfBStartsOn",
         ${endsOnSql(Prisma.sql`half_b."ends_at"`)}     AS "halfBEndsOn"
    FROM xb.campaigns AS campaign
    JOIN xb.employees AS author ON author."id" = campaign."created_by_id"
    LEFT JOIN xb.segments AS segment ON segment."id" = campaign."segment_id"
    LEFT JOIN xb.offices AS office ON office."id" = campaign."office_id"
    LEFT JOIN xb.campaign_halves AS half_a
           ON half_a."campaign_id" = campaign."id" AND half_a."half" = 'a'
    LEFT JOIN xb.campaign_halves AS half_b
           ON half_b."campaign_id" = campaign."id" AND half_b."half" = 'b'
`;

const toCampaignRow = (row: CampaignFlatRow): CampaignRow => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  status: row.status,
  isDemo: row.isDemo,
  segmentId: row.segmentId,
  segmentName: row.segmentName,
  segmentArchivedAt: row.segmentArchivedAt,
  splitEnabled: row.splitEnabled,
  audienceSize: row.audienceSize,
  officeId: row.officeId,
  officeName: row.officeName,
  officeArchivedAt: row.officeArchivedAt,
  rewardLifetimeDays: row.rewardLifetimeDays,
  createdByName: row.createdByName,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  launchedAt: row.launchedAt,
  halfA: {
    startsAt: row.halfAStartsAt,
    endsAt: row.halfAEndsAt,
    startsOn: row.halfAStartsOn,
    endsOn: row.halfAEndsOn,
  },
  halfB: row.hasHalfB
    ? {
        startsAt: row.halfBStartsAt,
        endsAt: row.halfBEndsAt,
        startsOn: row.halfBStartsOn,
        endsOn: row.halfBEndsOn,
      }
    : null,
});

/** Все акции, свежие первыми. Их единицы, страниц не нужно. */
export const listCampaigns = async (client: Executor = db): Promise<CampaignRow[]> => {
  const rows = await client.$queryRaw<CampaignFlatRow[]>`
    ${CAMPAIGN_SELECT}
     ORDER BY campaign."created_at" DESC
  `;

  return rows.map(toCampaignRow);
};

export const findCampaign = async (
  campaignId: string,
  client: Executor = db,
): Promise<CampaignRow | null> => {
  const rows = await client.$queryRaw<CampaignFlatRow[]>`
    ${CAMPAIGN_SELECT}
     WHERE campaign."id" = ${campaignId}::uuid
  `;

  const row = rows[0];

  return row ? toCampaignRow(row) : null;
};

/**
 * Статус акции под блокировкой строки — до конца транзакции. Два запуска подряд так идут
 * по очереди: второй увидит уже запущенную, а не снимет второй снимок рядом с первым.
 */
export const lockCampaignStatus = async (
  campaignId: string,
  client: Executor,
): Promise<CampaignStatus | null> => {
  const rows = await client.$queryRaw<{ status: CampaignStatus }[]>`
    SELECT "status" FROM xb.campaigns WHERE "id" = ${campaignId}::uuid FOR UPDATE
  `;

  return rows[0]?.status ?? null;
};

export type CampaignDraftFields = {
  title: string | null;
  slug: string | null;
  segmentId: string | null;
  splitEnabled: boolean;
  officeId: string | null;
  rewardLifetimeDays: number | null;
};

/** Окно датами `YYYY-MM-DD`: первый и последний день включительно. */
export type CampaignWindowDays = {
  startsOn: string | null;
  endsOn: string | null;
};

/** Метка начала окна: 05:00 первого дня. */
const windowStartSql = (startsOn: string | null): Prisma.Sql =>
  Prisma.sql`CASE WHEN ${startsOn}::date IS NULL THEN NULL
                  ELSE ${parkDayStartSql(Prisma.sql`${startsOn}::date`)} END`;

/** Метка конца окна: 05:00 дня, следующего за последним. */
const windowEndSql = (endsOn: string | null): Prisma.Sql =>
  Prisma.sql`CASE WHEN ${endsOn}::date IS NULL THEN NULL
                  ELSE ${parkDayStartSql(Prisma.sql`${endsOn}::date + 1`)} END`;

/**
 * Заводит черновик. Строку окна половины А ставит сервис в той же транзакции.
 *
 * Признак демо ставится только здесь: правка его не трогает (issue #212).
 */
export const insertDraftCampaign = async (
  input: CampaignDraftFields & { createdById: string; isDemo: boolean },
  client: Executor = db,
): Promise<string> => {
  const rows = await client.$queryRaw<{ id: string }[]>`
    INSERT INTO xb.campaigns (
      "title", "slug", "segment_id", "split_enabled", "office_id", "reward_lifetime_days",
      "status", "created_by_id", "is_demo"
    )
    VALUES (
      ${input.title},
      ${input.slug},
      ${input.segmentId}::uuid,
      ${input.splitEnabled},
      ${input.officeId}::uuid,
      ${input.rewardLifetimeDays}::int,
      'draft'::xb.campaign_status,
      ${input.createdById}::uuid,
      ${input.isDemo}
    )
    RETURNING "id"
  `;

  const row = rows[0];

  if (!row) {
    throw new Error('вставка акции не вернула строку');
  }

  return row.id;
};

/** Правка черновика. `false` — строки нет или она уже не черновик: запущенную не правят. */
export const updateDraftCampaign = async (
  campaignId: string,
  input: CampaignDraftFields,
  client: Executor = db,
): Promise<boolean> => {
  const updated = await client.$executeRaw`
    UPDATE xb.campaigns
       SET "title"         = ${input.title},
           "slug"          = ${input.slug},
           "segment_id"    = ${input.segmentId}::uuid,
           "split_enabled" = ${input.splitEnabled},
           "office_id"     = ${input.officeId}::uuid,
           "reward_lifetime_days" = ${input.rewardLifetimeDays}::int,
           "updated_at"    = now()
     WHERE "id" = ${campaignId}::uuid
       AND "status" = 'draft'
  `;

  return updated > 0;
};

/**
 * Заводит строку окна половины. Повтор второй строки не заводит: пара «акция + половина» —
 * первичный ключ. `false` — строка уже была.
 */
export const insertCampaignHalf = async (
  campaignId: string,
  half: CampaignHalfCode,
  window: CampaignWindowDays,
  client: Executor = db,
): Promise<boolean> => {
  const inserted = await client.$executeRaw`
    INSERT INTO xb.campaign_halves ("campaign_id", "half", "starts_at", "ends_at")
    VALUES (
      ${campaignId}::uuid,
      ${half}::xb.campaign_half,
      ${windowStartSql(window.startsOn)},
      ${windowEndSql(window.endsOn)}
    )
    ON CONFLICT ("campaign_id", "half") DO NOTHING
  `;

  return inserted > 0;
};

/** Окно половины А черновика. `false` — акция уже не черновик. */
export const updateDraftCampaignFirstHalf = async (
  campaignId: string,
  window: CampaignWindowDays,
  client: Executor = db,
): Promise<boolean> => {
  const updated = await client.$executeRaw`
    UPDATE xb.campaign_halves AS half
       SET "starts_at" = ${windowStartSql(window.startsOn)},
           "ends_at"   = ${windowEndSql(window.endsOn)}
      FROM xb.campaigns AS campaign
     WHERE campaign."id" = half."campaign_id"
       AND half."campaign_id" = ${campaignId}::uuid
       AND half."half" = 'a'
       AND campaign."status" = 'draft'
  `;

  return updated > 0;
};

/**
 * Окно половины Б идущей акции. Назначается один раз: только пока обе даты пусты.
 * `false` — акции нет, она не идёт, деления не было или окно уже назначено; какая
 * из причин — разбирает сервис.
 */
export const setCampaignSecondHalfWindow = async (
  campaignId: string,
  window: { startsOn: string; endsOn: string },
  client: Executor = db,
): Promise<boolean> => {
  const updated = await client.$executeRaw`
    UPDATE xb.campaign_halves AS half
       SET "starts_at" = ${windowStartSql(window.startsOn)},
           "ends_at"   = ${windowEndSql(window.endsOn)}
      FROM xb.campaigns AS campaign
     WHERE campaign."id" = half."campaign_id"
       AND half."campaign_id" = ${campaignId}::uuid
       AND half."half" = 'b'
       AND half."starts_at" IS NULL
       AND half."ends_at" IS NULL
       AND campaign."status" = 'running'
       AND campaign."split_enabled"
  `;

  return updated > 0;
};

/**
 * Снимок состава. Берёт людей построителем сегментов — тем же, которым считается
 * предпросмотр (`segmentMembersSql`): второй запрос по тем же условиям разошёлся бы с числом,
 * которое сотрудник видел перед запуском.
 *
 * При делении половины режет `ntile(2)` над случайным порядком: они получаются равными,
 * а не примерно равными, и при нечётном числе в А на одного больше — `ntile` отдаёт лишнего
 * первой группе. Без деления всем `a`, и `ntile` не считается вовсе: оконная функция
 * вычисляется до любого условия вокруг неё, и внутри `CASE` она сортировала бы весь состав
 * по случайному ключу впустую. Поэтому выражение половины выбирается здесь, кодом, — это
 * выбор между двумя готовыми кусками SQL, а не сборка запроса из пользовательского ввода.
 *
 * Строки окон обеих половин к этому моменту обязаны быть: половина участника ссылается
 * на `campaign_halves` внешним ключом.
 *
 * Повтор вторых строк не заводит: пара «акция + человек» — первичный ключ.
 */
export const insertCampaignParticipants = async (
  campaignId: string,
  conditions: SegmentConditions,
  segmentIsDemo: boolean,
  splitEnabled: boolean,
  client: Executor,
): Promise<number> => {
  const halfSql = splitEnabled
    ? Prisma.sql`CASE WHEN ntile(2) OVER (ORDER BY random()) = 2
                      THEN 'b'::xb.campaign_half
                      ELSE 'a'::xb.campaign_half
                 END`
    : Prisma.sql`'a'::xb.campaign_half`;

  return client.$executeRaw`
    INSERT INTO xb.campaign_participants ("campaign_id", "person_id", "half", "state")
    SELECT ${campaignId}::uuid,
           member."personId",
           ${halfSql},
           'invited'::xb.campaign_participant_state
      FROM (${segmentMembersSql(conditions, segmentIsDemo)}) AS member
    ON CONFLICT ("campaign_id", "person_id") DO NOTHING
  `;
};

/**
 * Черновик → идёт, с размером снимка. Одним `UPDATE`: у идущей размер снимка есть всегда —
 * проверкой `campaigns_status_check`. `false` — строка уже не черновик.
 */
export const markCampaignRunning = async (
  campaignId: string,
  audienceSize: number,
  client: Executor,
): Promise<boolean> => {
  const updated = await client.$executeRaw`
    UPDATE xb.campaigns
       SET "status"        = 'running'::xb.campaign_status,
           "audience_size" = ${audienceSize}::int,
           "launched_at"   = now(),
           "updated_at"    = now()
     WHERE "id" = ${campaignId}::uuid
       AND "status" = 'draft'
  `;

  return updated > 0;
};

export type CampaignStateCountRow = {
  half: CampaignHalfCode;
  state: CampaignParticipantState;
  /** Пусто, пока итог окна не подведён. */
  outcome: CampaignParticipantOutcome | null;
  total: number;
};

/**
 * Сколько участников в каждом сочетании состояния и исхода на каждой половине — одним
 * проходом на обе разбивки карточки. Пустых сочетаний в ответе нет.
 */
export const countCampaignParticipantStates = async (
  campaignId: string,
  client: Executor = db,
): Promise<CampaignStateCountRow[]> =>
  client.$queryRaw<CampaignStateCountRow[]>`
    SELECT "half", "state", "outcome", count(*)::int AS "total"
      FROM xb.campaign_participants
     WHERE "campaign_id" = ${campaignId}::uuid
     GROUP BY "half", "state", "outcome"
     ORDER BY "half", "state", "outcome"
  `;

export type CampaignParticipantFilter = {
  half: CampaignHalfCode | null;
  state: CampaignParticipantState | null;
  outcome: CampaignParticipantOutcome | null;
};

/**
 * Порядок страницы участников. По умолчанию — по фамилии; по зачётным дням и по времени
 * итога — убыванием, пустые в конце: с фильтром «не дотянул» первыми встают те, кому
 * не хватило одного дня.
 */
export type CampaignParticipantSort = 'name' | 'qualified_days' | 'outcome_at';

const participantFilterSql = (campaignId: string, filter: CampaignParticipantFilter): Prisma.Sql =>
  Prisma.sql`
    participant."campaign_id" = ${campaignId}::uuid
    AND (${filter.half}::xb.campaign_half IS NULL
         OR participant."half" = ${filter.half}::xb.campaign_half)
    AND (${filter.state}::xb.campaign_participant_state IS NULL
         OR participant."state" = ${filter.state}::xb.campaign_participant_state)
    AND (${filter.outcome}::xb.campaign_participant_outcome IS NULL
         OR participant."outcome" = ${filter.outcome}::xb.campaign_participant_outcome)
  `;

const NAME_ORDER_SQL = Prisma.sql`profile."lastName" ASC NULLS LAST,
              profile."firstName" ASC NULLS LAST,
              participant."person_id" ASC`;

/**
 * Выражение порядка выбирается кодом из трёх готовых кусков SQL — это выбор, а не сборка
 * запроса из пользовательского ввода. Имя и идентификатор в хвосте у всех: без них две
 * страницы могут показать одну строку дважды.
 */
const participantOrderSql = (sort: CampaignParticipantSort): Prisma.Sql => {
  switch (sort) {
    case 'qualified_days':
      return Prisma.sql`participant."qualified_days" DESC NULLS LAST, ${NAME_ORDER_SQL}`;
    case 'outcome_at':
      return Prisma.sql`participant."outcome_at" DESC NULLS LAST, ${NAME_ORDER_SQL}`;
    case 'name':
      return NAME_ORDER_SQL;
  }
};

export const countCampaignParticipants = async (
  campaignId: string,
  filter: CampaignParticipantFilter,
  client: Executor = db,
): Promise<number> => {
  const rows = await client.$queryRaw<{ total: number }[]>`
    SELECT count(*)::int AS "total"
      FROM xb.campaign_participants AS participant
     WHERE ${participantFilterSql(campaignId, filter)}
  `;

  return rows[0]?.total ?? 0;
};

export type CampaignParticipantRow = {
  personId: string;
  lastName: string | null;
  firstName: string | null;
  middleName: string | null;
  callsigns: string[];
  half: CampaignHalfCode;
  state: CampaignParticipantState;
  changedAt: Date;
  outcome: CampaignParticipantOutcome | null;
  qualifiedDays: number | null;
};

/**
 * Страница участников. «Когда сменилось» — отметка текущего состояния: конечные важнее
 * «открыл», у приглашённого — время снимка.
 *
 * Порядок — `participantOrderSql`. Профиль для показа — как в поиске и сегментах: работающий важнее
 * уволенного, среди равных свежий.
 */
export const listCampaignParticipantsPage = async (
  campaignId: string,
  filter: CampaignParticipantFilter,
  sort: CampaignParticipantSort,
  limit: number,
  offset: number,
  client: Executor = db,
): Promise<CampaignParticipantRow[]> =>
  client.$queryRaw<CampaignParticipantRow[]>`
    SELECT participant."person_id" AS "personId",
           profile."lastName",
           profile."firstName",
           profile."middleName",
           profiles."callsigns",
           participant."half",
           participant."state",
           coalesce(participant."declined_at", participant."joined_at",
                    participant."opened_at", participant."created_at") AS "changedAt",
           participant."outcome",
           participant."qualified_days" AS "qualifiedDays"
      FROM xb.campaign_participants AS participant
      LEFT JOIN LATERAL (
        SELECT candidate."last_name"   AS "lastName",
               candidate."first_name"  AS "firstName",
               candidate."middle_name" AS "middleName"
          FROM xb.park_profiles AS candidate
         WHERE candidate."person_id" = participant."person_id"
         ORDER BY (candidate."work_status" = 'working') DESC, candidate."api_updated_at" DESC
         LIMIT 1
      ) AS profile ON TRUE
      LEFT JOIN LATERAL (
        SELECT coalesce(
                 array_agg(DISTINCT candidate."callsign")
                   FILTER (WHERE candidate."callsign" IS NOT NULL),
                 ARRAY[]::text[]
               ) AS "callsigns"
          FROM xb.park_profiles AS candidate
         WHERE candidate."person_id" = participant."person_id"
      ) AS profiles ON TRUE
     WHERE ${participantFilterSql(campaignId, filter)}
     ORDER BY ${participantOrderSql(sort)}
     LIMIT ${limit} OFFSET ${offset}
  `;

// ---------------------------------------------------------------------------
// Участие водителя
// ---------------------------------------------------------------------------

export type MemberCampaignRow = {
  campaignId: string;
  title: string;
  state: CampaignParticipantState;
  startsOn: string;
  endsOn: string;
  joinedAt: Date | null;
  /** Длина окна половины в сутках парка — `W`. */
  windowDays: number;
  /** Номер сегодняшнего дня окна, с единицы, — `d`. */
  day: number;
  /** Сутки парка каждого дня окна, `YYYY-MM-DD`, по порядку. */
  dayDates: string[];
  outcome: CampaignParticipantOutcome | null;
  qualifiedDays: number | null;
  /** Снимок поездок по дням на момент итога. Пусто, пока итог не подведён. */
  outcomeDayTrips: number[] | null;
};

/** Сутки парка, с которых начинается окно половины. */
const windowFirstDaySql = (half: Prisma.Sql): Prisma.Sql => parkDaySql(Prisma.sql`${half}."starts_at"`);

/**
 * Длина окна половины в сутках парка — `W`. Метка конца — начало суток, следующих
 * за последним днём, поэтому разница дат и есть число дней.
 */
const windowDaysSql = (half: Prisma.Sql): Prisma.Sql =>
  Prisma.sql`(${parkDaySql(Prisma.sql`${half}."ends_at"`)} - ${windowFirstDaySql(half)})`;

/**
 * Зачитанные поездки участника по дням окна — массивом из `W` чисел в порядке дней (issue #168).
 * Одно выражение на человека, а не семь запросов, и одно на экран и на итог окна: второй счёт
 * тех же поездок однажды разошёлся бы с первым, и итог объявил бы не то, что видел водитель.
 *
 * - сутки режет `parkDaySql` — с 05:00 по Ташкенту; заказ через границу суток ложится
 *   в день своего `ended_at` целиком;
 * - в зачёт идут только завершённые после вступления: `ended_at >= joined_at`. Не `synced_at` —
 *   он перезаписывается каждым прогоном, накрывшим заказ, и значит последнее касание,
 *   а не первое появление. Пока `joined_at` пуст, сравнение не проходит ни разу — нули;
 * - поездки берутся на человека через все его профили парка, как у `countCompletedTripsByPerson`:
 *   переоформленный водитель иначе потерял бы часть поездок;
 * - дни без поездок добираются рядом дней окна и приходят нулём, а не пропадают из выдачи.
 *
 * `participant` и `half` — псевдонимы строк участия и окна в окружающем запросе.
 */
const dayTripsSql = (participant: Prisma.Sql, half: Prisma.Sql): Prisma.Sql => Prisma.sql`
  ARRAY(
    SELECT coalesce(per_day."trips", 0)
      FROM generate_series(0, ${windowDaysSql(half)} - 1) AS window_day("offset")
      LEFT JOIN (
        SELECT ${parkDaySql(Prisma.sql`trip."ended_at"`)} AS "day", count(*)::int AS "trips"
          FROM xb.trips AS trip
          JOIN xb.park_profiles AS profile ON profile."profile_id" = trip."profile_id"
         WHERE profile."person_id" = ${participant}."person_id"
           AND trip."status" = ${COMPLETED_TRIP_STATUS}
           AND trip."ended_at" >= ${participant}."joined_at"
           AND trip."ended_at" >= ${half}."starts_at"
           AND trip."ended_at" < ${half}."ends_at"
         GROUP BY 1
      ) AS per_day ON per_day."day" = ${windowFirstDaySql(half)} + window_day."offset"
     ORDER BY window_day."offset"
  )
`;

/**
 * Акция, которая видна водителю в этот момент: он в снимке идущей акции, окно его половины
 * уже началось, и экран ещё жив. Начало входит в окно, конец — нет.
 *
 * Экран живёт дольше окна (issue #182, docs/decisions.md → «Сундук открывается сразу, как
 * заработан»): вступившему — до вскрытия неоткрытых сундуков, `revealAfterHours` после метки
 * конца окна, то есть до 21:00 суток, следующих за последним днём. Не вступившему — до конца
 * окна, как раньше: забирать ему нечего, а экран приглашения после конца акции звал бы
 * вступить в то, что кончилось.
 *
 * Половина Б до начала своего окна акции не видит вовсе: у неё окна нет, пока его
 * не назначили, а назначенное ещё не началось. Она контроль, и показать ей акцию значило бы
 * испортить замер.
 *
 * Если окон сразу несколько, берётся запущенная последней. «Сейчас» приходит параметром:
 * граница окна проверяется тестом на заданном часе, а не ожиданием утра восьмого числа.
 * От него же считается день окна: сутки парка «сейчас» минус сутки начала, плюс единица, —
 * в 04:50 это ещё вчерашний день, а после конца окна день на единицу больше его длины.
 */
export const findMemberCampaign = async (
  personId: string,
  now: Date,
  revealAfterHours: number,
  client: Executor = db,
): Promise<MemberCampaignRow | null> => {
  const rows = await client.$queryRaw<MemberCampaignRow[]>`
    SELECT campaign."id"    AS "campaignId",
           campaign."title",
           participant."state",
           ${startsOnSql(Prisma.sql`half."starts_at"`)} AS "startsOn",
           ${endsOnSql(Prisma.sql`half."ends_at"`)}     AS "endsOn",
           participant."joined_at"                      AS "joinedAt",
           ${windowDaysSql(Prisma.sql`half`)}::int      AS "windowDays",
           (${parkDaySql(Prisma.sql`${now}::timestamptz`)} - ${windowFirstDaySql(Prisma.sql`half`)} + 1)::int AS "day",
           ARRAY(
             SELECT to_char(${windowFirstDaySql(Prisma.sql`half`)} + window_day."offset", 'YYYY-MM-DD')
               FROM generate_series(0, ${windowDaysSql(Prisma.sql`half`)} - 1) AS window_day("offset")
              ORDER BY window_day."offset"
           )                                            AS "dayDates",
           participant."outcome",
           participant."qualified_days"                 AS "qualifiedDays",
           participant."day_trips"                      AS "outcomeDayTrips"
      FROM xb.campaign_participants AS participant
      JOIN xb.campaigns AS campaign ON campaign."id" = participant."campaign_id"
      JOIN xb.campaign_halves AS half
        ON half."campaign_id" = participant."campaign_id"
       AND half."half" = participant."half"
     WHERE participant."person_id" = ${personId}::uuid
       AND campaign."status" = 'running'
       AND half."starts_at" <= ${now}::timestamptz
       AND (
             half."ends_at" > ${now}::timestamptz
             OR (
               participant."joined_at" IS NOT NULL
               AND half."ends_at" + make_interval(hours => ${revealAfterHours}::int) > ${now}::timestamptz
             )
           )
     ORDER BY campaign."launched_at" DESC
     LIMIT 1
  `;

  return rows[0] ?? null;
};

/**
 * Зачитанные поездки участника по дням окна его половины — от журнала, на момент запроса.
 * Экран зовёт это, только пока исход не проставлен: после итога неделя рисуется из снимка.
 */
export const readParticipantDayTrips = async (
  campaignId: string,
  personId: string,
  client: Executor = db,
): Promise<number[]> => {
  const rows = await client.$queryRaw<{ dayTrips: number[] }[]>`
    SELECT ${dayTripsSql(Prisma.sql`participant`, Prisma.sql`half`)} AS "dayTrips"
      FROM xb.campaign_participants AS participant
      JOIN xb.campaign_halves AS half
        ON half."campaign_id" = participant."campaign_id"
       AND half."half" = participant."half"
     WHERE participant."campaign_id" = ${campaignId}::uuid
       AND participant."person_id" = ${personId}::uuid
  `;

  return rows[0]?.dayTrips ?? [];
};

// ---------------------------------------------------------------------------
// Итог окна
// ---------------------------------------------------------------------------

export type CampaignHalfRef = {
  campaignId: string;
  half: CampaignHalfCode;
};

/**
 * Половины идущих акций, чьё окно кончилось не меньше `buffer` назад и у которых остались
 * участники без исхода. Буфер — на опоздавшие из Fleet API поездки (docs/decisions.md →
 * «Сутки — с 05:00 до 05:00 по Ташкенту»).
 */
export const listHalvesDueForOutcome = async (
  now: Date,
  bufferHours: number,
  client: Executor = db,
): Promise<CampaignHalfRef[]> =>
  client.$queryRaw<CampaignHalfRef[]>`
    SELECT half."campaign_id" AS "campaignId", half."half"
      FROM xb.campaign_halves AS half
      JOIN xb.campaigns AS campaign ON campaign."id" = half."campaign_id"
     WHERE campaign."status" = 'running'
       AND half."ends_at" + make_interval(hours => ${bufferHours}::int) <= ${now}::timestamptz
       AND EXISTS (
             SELECT 1
               FROM xb.campaign_participants AS participant
              WHERE participant."campaign_id" = half."campaign_id"
                AND participant."half" = half."half"
                AND participant."outcome" IS NULL
           )
     ORDER BY half."ends_at", half."campaign_id", half."half"
  `;

export type ParticipantAwaitingOutcomeRow = {
  personId: string;
  state: CampaignParticipantState;
  dayTrips: number[];
};

/** Участники половины без исхода — с состоянием и зачитанными поездками по дням окна. */
export const listParticipantsAwaitingOutcome = async (
  campaignId: string,
  half: CampaignHalfCode,
  client: Executor = db,
): Promise<ParticipantAwaitingOutcomeRow[]> =>
  client.$queryRaw<ParticipantAwaitingOutcomeRow[]>`
    SELECT participant."person_id" AS "personId",
           participant."state",
           ${dayTripsSql(Prisma.sql`participant`, Prisma.sql`half`)} AS "dayTrips"
      FROM xb.campaign_participants AS participant
      JOIN xb.campaign_halves AS half
        ON half."campaign_id" = participant."campaign_id"
       AND half."half" = participant."half"
     WHERE participant."campaign_id" = ${campaignId}::uuid
       AND participant."half" = ${half}::xb.campaign_half
       AND participant."outcome" IS NULL
     ORDER BY participant."person_id"
  `;

export type ParticipantOutcomeInput = {
  personId: string;
  outcome: CampaignParticipantOutcome;
  qualifiedDays: number;
  dayTrips: number[];
};

/**
 * Пишет исходы со снимком. Только туда, где исхода ещё нет, — условием в `UPDATE`, а не
 * проверкой перед ним: повторный прогон, перезапуск воркера и две одновременные попытки
 * не переписывают ничего. Задним числом исход не пересматривается. Возвращает людей,
 * получивших исход сейчас, — по ним и только по ним уходит сообщение об итоге (issue #182).
 *
 * Пачка уезжает строкой JSON: массив поездок по дням у каждой строки свой, а `unnest`
 * двумерный массив разворачивает по элементам, а не по строкам.
 */
export const writeParticipantOutcomes = async (
  campaignId: string,
  rows: readonly ParticipantOutcomeInput[],
  client: Executor = db,
): Promise<string[]> => {
  if (rows.length === 0) {
    return [];
  }

  const written = await client.$queryRaw<{ personId: string }[]>`
    UPDATE xb.campaign_participants AS participant
       SET "outcome"        = decided."outcome"::xb.campaign_participant_outcome,
           "outcome_at"     = now(),
           "qualified_days" = decided."qualifiedDays",
           "day_trips"      = decided."dayTrips",
           "updated_at"     = now()
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
           AS decided("personId" uuid, "outcome" text, "qualifiedDays" int, "dayTrips" int[])
     WHERE participant."campaign_id" = ${campaignId}::uuid
       AND participant."person_id" = decided."personId"
       AND participant."outcome" IS NULL
    RETURNING participant."person_id" AS "personId"
  `;

  return written.map((row) => row.personId);
};

/**
 * Пороги лестницы сундуков — числами из `weekProgress.ts`. Приходят параметром, а не живут
 * здесь второй копией: правило «что заработано» одно на экран, открытие и таймер.
 */
export type ChestThresholds = {
  /** Поездок за сутки, чтобы день зачёлся. */
  dayGoalTrips: number;
  /** Зачётных дней до сундука трёх дней. */
  threeDaysRequired: number;
  /** Зачётных дней до сундука недели. */
  weekRequired: number;
};

/** Нет строки открытого сундука этой ступени (и этого дня — у сундука дня). */
const chestMissingSql = (
  participant: Prisma.Sql,
  kind: 'day' | 'three_days' | 'week',
  dayNumber: Prisma.Sql | null,
): Prisma.Sql => Prisma.sql`
  NOT EXISTS (
    SELECT 1
      FROM xb.campaign_chests AS chest
     WHERE chest."campaign_id" = ${participant}."campaign_id"
       AND chest."person_id" = ${participant}."person_id"
       AND chest."kind" = ${kind}::xb.campaign_chest_kind
       AND ${dayNumber === null ? Prisma.sql`TRUE` : Prisma.sql`chest."day_number" = ${dayNumber}`}
  )
`;

/**
 * У участника есть заработанный и неоткрытый сундук — по снимку итога, а не по журналу
 * (issue #182): исход объявлен, и вскрытие обязано выдать ровно то, что объявлено. Тот же
 * счёт, что у `chestLadder` над замершей неделей: день зачтён — сундук дня этого дня,
 * зачётных дней хватает — ступень.
 *
 * `day_trips` индексируется с единицы, как и номер дня окна, — индекс и есть `day_number`.
 */
const earnedUnopenedChestSql = (participant: Prisma.Sql, thresholds: ChestThresholds): Prisma.Sql =>
  Prisma.sql`(
    ${participant}."outcome" IS NOT NULL
    AND ${participant}."joined_at" IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
          FROM generate_subscripts(${participant}."day_trips", 1) AS window_day("number")
         WHERE ${participant}."day_trips"[window_day."number"] >= ${thresholds.dayGoalTrips}::int
           AND ${chestMissingSql(participant, 'day', Prisma.sql`window_day."number"`)}
      )
      OR (
        ${participant}."qualified_days" >= ${thresholds.threeDaysRequired}::int
        AND ${chestMissingSql(participant, 'three_days', null)}
      )
      OR (
        ${participant}."qualified_days" >= ${thresholds.weekRequired}::int
        AND ${chestMissingSql(participant, 'week', null)}
      )
    )
  )`;

/**
 * Идёт → окончена — у каждой идущей акции, где сошлись три условия (issue #182):
 *
 * 1. **у всех её половин прошло вскрытие** — `ends_at + revealAfterHours`, 21:00 суток после
 *    последнего дня окна. Экран виден только у идущей акции, и перевод раньше погасил бы его
 *    у всех разом — в том числе у водителя, который открыл всё сам и в 09:00 пришёл посмотреть
 *    итог. Срок жизни экрана не должен зависеть от того, что делают другие участники. Половина
 *    без назначенного окна (`ends_at` пуст) держит акцию идущей;
 * 2. исход получили все участники обеих половин;
 * 3. ни у кого не осталось заработанного неоткрытого сундука. Это условие держит акцию идущей,
 *    если вскрытие не смогло выдать приз: следующий прогон попробует снова.
 *
 * Условием в `UPDATE`, по всем идущим, а не по только что подведённым: прогон, упавший между
 * записью и этим шагом, иначе оставил бы акцию идущей навсегда — следующему подводить уже нечего.
 * Возвращает идентификаторы оконченных сейчас.
 */
export const finishSettledCampaigns = async (
  now: Date,
  revealAfterHours: number,
  thresholds: ChestThresholds,
  client: Executor = db,
): Promise<string[]> => {
  const rows = await client.$queryRaw<{ id: string }[]>`
    UPDATE xb.campaigns AS campaign
       SET "status"     = 'finished'::xb.campaign_status,
           "updated_at" = now()
     WHERE campaign."status" = 'running'
       AND NOT EXISTS (
             SELECT 1
               FROM xb.campaign_halves AS half
              WHERE half."campaign_id" = campaign."id"
                AND (
                      half."ends_at" IS NULL
                      OR half."ends_at" + make_interval(hours => ${revealAfterHours}::int)
                           > ${now}::timestamptz
                    )
           )
       AND NOT EXISTS (
             SELECT 1
               FROM xb.campaign_participants AS participant
              WHERE participant."campaign_id" = campaign."id"
                AND (
                      participant."outcome" IS NULL
                      OR ${earnedUnopenedChestSql(Prisma.sql`participant`, thresholds)}
                    )
           )
    RETURNING campaign."id"
  `;

  return rows.map((row) => row.id);
};

// ---------------------------------------------------------------------------
// Вскрытие неоткрытых сундуков (issue #182)
// ---------------------------------------------------------------------------

/**
 * Половины идущих акций, у которых наступило вскрытие — `revealAfterHours` после метки конца
 * окна, — и у которых остались участники с заработанными неоткрытыми сундуками.
 */
export const listHalvesDueForReveal = async (
  now: Date,
  revealAfterHours: number,
  thresholds: ChestThresholds,
  client: Executor = db,
): Promise<CampaignHalfRef[]> =>
  client.$queryRaw<CampaignHalfRef[]>`
    SELECT half."campaign_id" AS "campaignId", half."half"
      FROM xb.campaign_halves AS half
      JOIN xb.campaigns AS campaign ON campaign."id" = half."campaign_id"
     WHERE campaign."status" = 'running'
       AND half."ends_at" + make_interval(hours => ${revealAfterHours}::int) <= ${now}::timestamptz
       AND EXISTS (
             SELECT 1
               FROM xb.campaign_participants AS participant
              WHERE participant."campaign_id" = half."campaign_id"
                AND participant."half" = half."half"
                AND ${earnedUnopenedChestSql(Prisma.sql`participant`, thresholds)}
           )
     ORDER BY half."ends_at", half."campaign_id", half."half"
  `;

export type ParticipantDueForRevealRow = {
  personId: string;
  /** Длина окна половины — `W`. */
  windowDays: number;
  qualifiedDays: number | null;
  /** Снимок поездок по дням на момент итога. */
  outcomeDayTrips: number[] | null;
};

/** Участники половины с заработанными неоткрытыми сундуками — со снимком итога. */
export const listParticipantsDueForReveal = async (
  campaignId: string,
  half: CampaignHalfCode,
  thresholds: ChestThresholds,
  client: Executor = db,
): Promise<ParticipantDueForRevealRow[]> =>
  client.$queryRaw<ParticipantDueForRevealRow[]>`
    SELECT participant."person_id"                        AS "personId",
           ${windowDaysSql(Prisma.sql`half`)}::int         AS "windowDays",
           participant."qualified_days"                   AS "qualifiedDays",
           participant."day_trips"                        AS "outcomeDayTrips"
      FROM xb.campaign_participants AS participant
      JOIN xb.campaign_halves AS half
        ON half."campaign_id" = participant."campaign_id"
       AND half."half" = participant."half"
     WHERE participant."campaign_id" = ${campaignId}::uuid
       AND participant."half" = ${half}::xb.campaign_half
       AND ${earnedUnopenedChestSql(Prisma.sql`participant`, thresholds)}
     ORDER BY participant."person_id"
  `;

/**
 * Переход состояния участника — только из перечисленных. Назад состояния не ходят, и повтор
 * того же нажатия строку не трогает. `false` — перехода не было.
 */
const moveParticipantState = async (
  campaignId: string,
  personId: string,
  to: CampaignParticipantState,
  from: CampaignParticipantState[],
  client: Executor,
): Promise<boolean> => {
  const updated = await client.$executeRaw`
    UPDATE xb.campaign_participants
       SET "state"       = ${to}::xb.campaign_participant_state,
           "opened_at"   = CASE WHEN ${to} = 'opened'   THEN now() ELSE "opened_at" END,
           "joined_at"   = CASE WHEN ${to} = 'joined'   THEN now() ELSE "joined_at" END,
           "declined_at" = CASE WHEN ${to} = 'declined' THEN now() ELSE "declined_at" END,
           "updated_at"  = now()
     WHERE "campaign_id" = ${campaignId}::uuid
       AND "person_id" = ${personId}::uuid
       AND "state"::text = ANY(${from}::text[])
  `;

  return updated > 0;
};

/** Приглашённый открыл экран акции. */
export const markParticipantOpened = (
  campaignId: string,
  personId: string,
  client: Executor = db,
): Promise<boolean> => moveParticipantState(campaignId, personId, 'opened', ['invited'], client);

/** «Участвовать». */
export const markParticipantJoined = (
  campaignId: string,
  personId: string,
  client: Executor = db,
): Promise<boolean> =>
  moveParticipantState(campaignId, personId, 'joined', ['invited', 'opened'], client);

/** «Отказаться». */
export const markParticipantDeclined = (
  campaignId: string,
  personId: string,
  client: Executor = db,
): Promise<boolean> =>
  moveParticipantState(campaignId, personId, 'declined', ['invited', 'opened'], client);

/**
 * Строка участия под блокировкой — до конца транзакции. Открытие сундука берёт её первой:
 * два нажатия подряд идут по очереди, и второе видит уже открытый сундук, а не разыгрывает
 * второй приз. `false` — строки нет.
 */
export const lockCampaignParticipant = async (
  campaignId: string,
  personId: string,
  transaction: Executor,
): Promise<boolean> => {
  const rows = await transaction.$queryRaw<{ personId: string }[]>`
    SELECT "person_id" AS "personId"
      FROM xb.campaign_participants
     WHERE "campaign_id" = ${campaignId}::uuid
       AND "person_id" = ${personId}::uuid
       FOR UPDATE
  `;

  return rows.length > 0;
};
