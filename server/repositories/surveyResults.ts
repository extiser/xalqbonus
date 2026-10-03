import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';
import type { Language } from '#server/generated/prisma/enums';
import { parkDaySql, parkDayStartSql } from '#server/utils/parkDaySql';
import { COMPLETED_TRIP_STATUS } from '#server/utils/tripStatus';
import type { SegmentConditions } from '#shared/types/segment';
import { segmentMembersSql } from '#server/repositories/segments';

/**
 * Итоги опроса (issue #325): воронка, «Где бросают», ответы по вопросам и выгрузка.
 *
 * Все запросы файла стоят на одном множестве людей — `memberSql`: круг (снимок одной
 * рассылки или всех рассылок опроса) и признак среза у каждого. Воронка, ответы и выгрузка
 * не заводят своего отбора: три места, отбирающие людей по-своему, однажды показали бы
 * в таблице одних людей, а в файле других.
 *
 * Срез приходит признаком `inSlice` у строки: внутри — `true`, остальные — `false`, среза
 * нет — `NULL`. Запросы группируют по нему, итог складывает сервис — поэтому две колонки
 * и складываются в итог.
 *
 * Схема в сыром SQL указывается явно — `xb.survey_responses`, а не `survey_responses`
 * (docs/decisions.md → «В сыром SQL схема указывается явно»).
 */

type Executor = Prisma.TransactionClient;

/** Чей круг: снимок одной рассылки или всех рассылок опроса без повторов. */
export type SurveyCohort = { kind: 'mailing'; mailingId: string } | { kind: 'survey'; surveyId: string };

/**
 * Срез. По сегменту — его нынешний состав тем же построителем, что у предпросмотра
 * (`segmentMembersSql`). По активности — верхние 20 % по завершённым поездкам за 30 календарных
 * суток перед сутками запуска, порог — по всем участникам программы того же мира с хотя бы
 * одной поездкой в окне.
 */
export type SurveySlice =
  | { kind: 'segment'; conditions: SegmentConditions; isDemo: boolean }
  | { kind: 'activity'; launchedAt: Date; isDemo: boolean };

/** Сутки окна активности: столько полных календарных суток перед сутками запуска. */
export const ACTIVITY_WINDOW_DAYS = 30;

/** Доля «тяжёлых»: порог — восьмидесятый перцентиль числа поездок. */
const ACTIVITY_PERCENTILE = 0.8;

export type SurveyResultsScope = {
  surveyId: string;
  cohort: SurveyCohort;
  slice: SurveySlice | null;
};

/**
 * Круг людей: `personId`, доставлено ли и когда. В сводном круге человек один, сколько бы
 * рассылок его ни захватило: доставлено — хотя бы одной, момент — самой ранней.
 */
const cohortSql = (cohort: SurveyCohort): Prisma.Sql =>
  cohort.kind === 'mailing'
    ? Prisma.sql`
        SELECT recipient."person_id"                                          AS "personId",
               recipient."outcome" = 'sent'                                    AS "delivered",
               CASE WHEN recipient."outcome" = 'sent' THEN recipient."outcome_at" END AS "deliveredAt"
          FROM xb.mailing_recipients AS recipient
         WHERE recipient."mailing_id" = ${cohort.mailingId}::uuid
      `
    : Prisma.sql`
        SELECT recipient."person_id"                                          AS "personId",
               bool_or(recipient."outcome" = 'sent')                           AS "delivered",
               min(recipient."outcome_at") FILTER (WHERE recipient."outcome" = 'sent') AS "deliveredAt"
          FROM xb.mailing_recipients AS recipient
          JOIN xb.mailings AS mailing ON mailing."id" = recipient."mailing_id"
         WHERE mailing."survey_id" = ${cohort.surveyId}::uuid
         GROUP BY recipient."person_id"
      `;

/** Окно активности: начало первых суток и начало суток запуска. */
const activityWindowSql = (launchedAt: Date): { from: Prisma.Sql; to: Prisma.Sql } => {
  const launchDay = parkDaySql(Prisma.sql`${launchedAt}::timestamptz`);

  return {
    from: parkDayStartSql(Prisma.sql`${launchDay} - ${ACTIVITY_WINDOW_DAYS}::int`),
    to: parkDayStartSql(launchDay),
  };
};

/**
 * Участники программы того же мира с завершёнными поездками в окне — и число поездок.
 * Поездки — по всем профилям человека: увольнение и заведение заново дают второй профиль,
 * а человек один (docs/drivers.md).
 */
const activitySql = (launchedAt: Date, isDemo: boolean): Prisma.Sql => {
  const window = activityWindowSql(launchedAt);

  return Prisma.sql`
    SELECT profile."person_id" AS "personId",
           count(*)::int       AS "trips"
      FROM xb.trips AS trip
      JOIN xb.park_profiles AS profile ON profile."profile_id" = trip."profile_id"
      JOIN xb.persons AS person ON person."id" = profile."person_id"
      JOIN xb.person_settings AS settings ON settings."person_id" = person."id"
     WHERE trip."status" = ${COMPLETED_TRIP_STATUS}
       AND trip."ended_at" >= ${window.from}
       AND trip."ended_at" < ${window.to}
       AND person."is_demo" = ${isDemo}::boolean
     GROUP BY profile."person_id"
  `;
};

/** Люди внутри среза — множеством `personId`. */
const sliceSql = (slice: SurveySlice): Prisma.Sql => {
  if (slice.kind === 'segment') {
    return Prisma.sql`
      SELECT segment_member."personId"
        FROM (${segmentMembersSql(slice.conditions, slice.isDemo)}) AS segment_member
    `;
  }

  // `percentile_disc` берёт настоящее число поездок, а не середину между двумя: порог —
  // это число, которое кто-то набрал. Равные порогу — наверху, и верхних бывает чуть больше 20 %.
  return Prisma.sql`
    WITH activity AS (${activitySql(slice.launchedAt, slice.isDemo)})
    SELECT activity."personId"
      FROM activity
     WHERE activity."trips" >= (
             SELECT percentile_disc(${ACTIVITY_PERCENTILE}::float8) WITHIN GROUP (ORDER BY activity."trips")
               FROM activity
           )
  `;
};

/**
 * Множество людей итогов — единственное: круг и признак среза. `completedOnly` сужает его
 * до прошедших опрос — переключатель ответов; воронку он не трогает.
 */
const memberSql = (scope: SurveyResultsScope, completedOnly: boolean): Prisma.Sql => {
  // Срез — соединением с множеством, а не `EXISTS` на каждого: состав сегмента — проход
  // по всему реестру, и подзапрос на строку снимка повторил бы его тысячи раз. Человек
  // во множестве один — и в составе сегмента, и в активности, — строк соединение не множит.
  const slice = scope.slice
    ? Prisma.sql`LEFT JOIN (${sliceSql(scope.slice)}) AS slice ON slice."personId" = cohort."personId"`
    : Prisma.empty;
  const inSlice = scope.slice ? Prisma.sql`(slice."personId" IS NOT NULL)` : Prisma.sql`NULL::boolean`;

  return Prisma.sql`
    SELECT cohort."personId",
           cohort."delivered",
           cohort."deliveredAt",
           ${inSlice} AS "inSlice"
      FROM (${cohortSql(scope.cohort)}) AS cohort
      ${slice}
     WHERE NOT ${completedOnly}::boolean
        OR EXISTS (
             SELECT 1
               FROM xb.survey_responses AS response
              WHERE response."survey_id" = ${scope.surveyId}::uuid
                AND response."person_id" = cohort."personId"
                AND response."completed_at" IS NOT NULL
           )
  `;
};

/** Признак среза у строки результата: внутри, остальные, среза нет. */
export type SliceFlag = boolean | null;

export type FunnelGroupRow = {
  inSlice: SliceFlag;
  sent: number;
  delivered: number;
  opened: number;
  declined: number;
  started: number;
  completed: number;
  appClicked: number;
};

/**
 * Воронка по группам среза. Отправлено — строка в круге, доставлено — исход `sent`, дальше —
 * метки прохождения человека: по его состоянию в опросе, а не по рассылке, которой он пришёл.
 * Строки прохождения нет — опрос он не открывал.
 */
export const listFunnelGroups = async (
  scope: SurveyResultsScope,
  client: Executor = db,
): Promise<FunnelGroupRow[]> =>
  client.$queryRaw<FunnelGroupRow[]>`
    WITH member AS (${memberSql(scope, false)})
    SELECT member."inSlice",
           count(*)::int                                   AS "sent",
           count(*) FILTER (WHERE member."delivered")::int AS "delivered",
           count(response."person_id")::int                AS "opened",
           count(response."declined_at")::int              AS "declined",
           count(response."started_at")::int               AS "started",
           count(response."completed_at")::int             AS "completed",
           count(response."app_clicked_at")::int           AS "appClicked"
      FROM member
      LEFT JOIN xb.survey_responses AS response
             ON response."survey_id" = ${scope.surveyId}::uuid
            AND response."person_id" = member."personId"
     GROUP BY member."inSlice"
  `;

export type DropOffGroupRow = {
  inSlice: SliceFlag;
  questionId: string;
  people: number;
};

/**
 * Где бросают: у непрошедших — вопрос последнего сохранённого ответа, самый дальний
 * по порядку. Пропущенный необязательный — тоже сохранённый ответ. Отказавшийся, который
 * потом начал и бросил, считается так же (решение Руслана 03-10-2026): отказ — кнопка
 * на экране открытия, а до вопроса он дошёл.
 */
export const listDropOffGroups = async (
  scope: SurveyResultsScope,
  client: Executor = db,
): Promise<DropOffGroupRow[]> =>
  client.$queryRaw<DropOffGroupRow[]>`
    WITH member AS (${memberSql(scope, false)})
    SELECT member."inSlice",
           question."id"      AS "questionId",
           count(*)::int      AS "people"
      FROM member
      JOIN xb.survey_responses AS response
        ON response."survey_id" = ${scope.surveyId}::uuid
       AND response."person_id" = member."personId"
       AND response."completed_at" IS NULL
      JOIN LATERAL (
           SELECT max(answered_question."position") AS "position"
             FROM xb.survey_answers AS answer
             JOIN xb.survey_questions AS answered_question
               ON answered_question."id" = answer."question_id"
            WHERE answer."survey_id" = response."survey_id"
              AND answer."person_id" = response."person_id"
      ) AS last_answer ON last_answer."position" IS NOT NULL
      JOIN xb.survey_questions AS question
        ON question."survey_id" = ${scope.surveyId}::uuid
       AND question."position" = last_answer."position"
     GROUP BY member."inSlice", question."id"
  `;

export type AnswerTotalsRow = {
  inSlice: SliceFlag;
  questionId: string;
  answered: number;
  skipped: number;
  ownAnswers: number;
};

/**
 * Сколько ответили и сколько пропустили — по вопросам. Ответ пустой, когда в нём нет
 * ни текста, ни оценки, ни своего варианта, ни выбранного варианта: так сохраняется
 * пропуск необязательного (решение Руслана 03-10-2026 — пропуск не «ответил»).
 */
export const listAnswerTotals = async (
  scope: SurveyResultsScope,
  completedOnly: boolean,
  client: Executor = db,
): Promise<AnswerTotalsRow[]> =>
  client.$queryRaw<AnswerTotalsRow[]>`
    WITH member AS (${memberSql(scope, completedOnly)})
    SELECT member."inSlice",
           answer."question_id"                             AS "questionId",
           count(*) FILTER (WHERE filled."value")::int      AS "answered",
           count(*) FILTER (WHERE NOT filled."value")::int  AS "skipped",
           count(answer."own_text")::int                    AS "ownAnswers"
      FROM member
      JOIN xb.survey_answers AS answer
        ON answer."survey_id" = ${scope.surveyId}::uuid
       AND answer."person_id" = member."personId"
     CROSS JOIN LATERAL (
           SELECT answer."text_value" IS NOT NULL
               OR answer."scale_value" IS NOT NULL
               OR answer."own_text" IS NOT NULL
               OR EXISTS (
                    SELECT 1
                      FROM xb.survey_answer_options AS chosen
                     WHERE chosen."survey_id" = answer."survey_id"
                       AND chosen."person_id" = answer."person_id"
                       AND chosen."question_id" = answer."question_id"
                  ) AS "value"
     ) AS filled
     GROUP BY member."inSlice", answer."question_id"
  `;

export type OptionCountRow = {
  inSlice: SliceFlag;
  optionId: string;
  people: number;
};

/** Людей, выбравших вариант. Пара «человек — вариант» одна — первичным ключом. */
export const listOptionCounts = async (
  scope: SurveyResultsScope,
  completedOnly: boolean,
  client: Executor = db,
): Promise<OptionCountRow[]> =>
  client.$queryRaw<OptionCountRow[]>`
    WITH member AS (${memberSql(scope, completedOnly)})
    SELECT member."inSlice",
           chosen."option_id" AS "optionId",
           count(*)::int      AS "people"
      FROM member
      JOIN xb.survey_answer_options AS chosen
        ON chosen."survey_id" = ${scope.surveyId}::uuid
       AND chosen."person_id" = member."personId"
     GROUP BY member."inSlice", chosen."option_id"
  `;

export type ScaleCountRow = {
  inSlice: SliceFlag;
  questionId: string;
  value: number;
  people: number;
};

/** Распределение оценок шкалы. */
export const listScaleCounts = async (
  scope: SurveyResultsScope,
  completedOnly: boolean,
  client: Executor = db,
): Promise<ScaleCountRow[]> =>
  client.$queryRaw<ScaleCountRow[]>`
    WITH member AS (${memberSql(scope, completedOnly)})
    SELECT member."inSlice",
           answer."question_id"     AS "questionId",
           answer."scale_value"::int AS "value",
           count(*)::int            AS "people"
      FROM member
      JOIN xb.survey_answers AS answer
        ON answer."survey_id" = ${scope.surveyId}::uuid
       AND answer."person_id" = member."personId"
     WHERE answer."scale_value" IS NOT NULL
     GROUP BY member."inSlice", answer."question_id", answer."scale_value"
  `;

export type TextAnswerRow = {
  inSlice: SliceFlag;
  questionId: string;
  textValue: string | null;
  ownText: string | null;
};

/** Ответы словами — текст вопроса `text` и «Свой вариант», свежие первыми. */
export const listTextAnswers = async (
  scope: SurveyResultsScope,
  completedOnly: boolean,
  client: Executor = db,
): Promise<TextAnswerRow[]> =>
  client.$queryRaw<TextAnswerRow[]>`
    WITH member AS (${memberSql(scope, completedOnly)})
    SELECT member."inSlice",
           answer."question_id" AS "questionId",
           answer."text_value"  AS "textValue",
           answer."own_text"    AS "ownText"
      FROM member
      JOIN xb.survey_answers AS answer
        ON answer."survey_id" = ${scope.surveyId}::uuid
       AND answer."person_id" = member."personId"
     WHERE answer."text_value" IS NOT NULL
        OR answer."own_text" IS NOT NULL
     ORDER BY answer."updated_at" DESC, member."personId"
  `;

export type ActivityThresholdRow = {
  /** `YYYY-MM-DD` — первые сутки окна. */
  windowFrom: string;
  /** `YYYY-MM-DD` — последние сутки окна. */
  windowTo: string;
  /** Пусто — в окне не ездил никто. */
  minTrips: number | null;
};

/** Окно и порог среза по активности — подписать колонку «внутри». */
export const findActivityThreshold = async (
  launchedAt: Date,
  isDemo: boolean,
  client: Executor = db,
): Promise<ActivityThresholdRow> => {
  const launchDay = parkDaySql(Prisma.sql`${launchedAt}::timestamptz`);

  const rows = await client.$queryRaw<ActivityThresholdRow[]>`
    WITH activity AS (${activitySql(launchedAt, isDemo)})
    SELECT (${launchDay} - ${ACTIVITY_WINDOW_DAYS}::int)::text AS "windowFrom",
           (${launchDay} - 1)::text                            AS "windowTo",
           (SELECT percentile_disc(${ACTIVITY_PERCENTILE}::float8) WITHIN GROUP (ORDER BY activity."trips")
              FROM activity)::int                              AS "minTrips"
  `;

  const row = rows[0];

  if (!row) {
    throw new Error('порог среза по активности не вернул строку');
  }

  return row;
};

export type ExportPersonRow = {
  personId: string;
  inSlice: SliceFlag;
  /** Позывные всех профилей человека, по алфавиту. */
  callsigns: string[];
  /** Пусто — человек не участник программы. */
  language: Language | null;
  deliveredAt: Date | null;
  openedAt: Date | null;
  declinedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  appClickedAt: Date | null;
};

/** Строки выгрузки — человек на строку, весь круг, по идентификатору. */
export const listExportPersons = async (
  scope: SurveyResultsScope,
  client: Executor = db,
): Promise<ExportPersonRow[]> =>
  client.$queryRaw<ExportPersonRow[]>`
    WITH member AS (${memberSql(scope, false)})
    SELECT member."personId",
           member."inSlice",
           profiles."callsigns",
           settings."language"::text  AS "language",
           member."deliveredAt",
           response."opened_at"       AS "openedAt",
           response."declined_at"     AS "declinedAt",
           response."started_at"      AS "startedAt",
           response."completed_at"    AS "completedAt",
           response."app_clicked_at"  AS "appClickedAt"
      FROM member
      LEFT JOIN xb.survey_responses AS response
             ON response."survey_id" = ${scope.surveyId}::uuid
            AND response."person_id" = member."personId"
      LEFT JOIN xb.person_settings AS settings ON settings."person_id" = member."personId"
      LEFT JOIN LATERAL (
           SELECT coalesce(
                    array_agg(DISTINCT profile."callsign" ORDER BY profile."callsign")
                      FILTER (WHERE profile."callsign" IS NOT NULL),
                    ARRAY[]::text[]
                  ) AS "callsigns"
             FROM xb.park_profiles AS profile
            WHERE profile."person_id" = member."personId"
      ) AS profiles ON TRUE
     ORDER BY member."personId"
  `;

export type ExportAnswerRow = {
  personId: string;
  questionId: string;
  /** Выбранные варианты по порядку вариантов. */
  optionIds: string[];
  ownText: string | null;
  textValue: string | null;
  scaleValue: number | null;
};

/** Ответы всего круга — для колонок вопросов в выгрузке. */
export const listExportAnswers = async (
  scope: SurveyResultsScope,
  client: Executor = db,
): Promise<ExportAnswerRow[]> =>
  client.$queryRaw<ExportAnswerRow[]>`
    WITH member AS (${memberSql(scope, false)})
    SELECT answer."person_id"        AS "personId",
           answer."question_id"      AS "questionId",
           answer."own_text"         AS "ownText",
           answer."text_value"       AS "textValue",
           answer."scale_value"::int AS "scaleValue",
           COALESCE(
             (SELECT array_agg(chosen."option_id"::text ORDER BY option."position")
                FROM xb.survey_answer_options AS chosen
                JOIN xb.survey_options AS option ON option."id" = chosen."option_id"
               WHERE chosen."survey_id" = answer."survey_id"
                 AND chosen."person_id" = answer."person_id"
                 AND chosen."question_id" = answer."question_id"),
             ARRAY[]::text[]
           ) AS "optionIds"
      FROM member
      JOIN xb.survey_answers AS answer
        ON answer."survey_id" = ${scope.surveyId}::uuid
       AND answer."person_id" = member."personId"
  `;

export type SurveyMailingRow = {
  mailingId: string;
  title: string | null;
  startedAt: Date;
  sent: number;
  completed: number;
};

/** Запущенные рассылки опроса — по порядку запуска: строк в снимке и сколько из них прошли. */
export const listSurveyMailings = async (
  surveyId: string,
  client: Executor = db,
): Promise<SurveyMailingRow[]> =>
  client.$queryRaw<SurveyMailingRow[]>`
    SELECT mailing."id"         AS "mailingId",
           mailing."title",
           mailing."started_at" AS "startedAt",
           (SELECT count(*)::int
              FROM xb.mailing_recipients AS recipient
             WHERE recipient."mailing_id" = mailing."id") AS "sent",
           (SELECT count(*)::int
              FROM xb.mailing_recipients AS recipient
              JOIN xb.survey_responses AS response
                ON response."survey_id" = mailing."survey_id"
               AND response."person_id" = recipient."person_id"
               AND response."completed_at" IS NOT NULL
             WHERE recipient."mailing_id" = mailing."id") AS "completed"
      FROM xb.mailings AS mailing
     WHERE mailing."survey_id" = ${surveyId}::uuid
       AND mailing."started_at" IS NOT NULL
     ORDER BY mailing."started_at", mailing."id"
  `;
