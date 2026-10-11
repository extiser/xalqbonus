import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';
import type {
  CandidateApplicationChannel,
  CandidateApplicationEventKind,
  CandidateApplicationStatus,
  CandidateMatch,
  CandidateMessageAuthor,
  CandidateMessageDelivery,
  CandidateMessageFailure,
  CandidateMessageKind,
  CandidatePhoneSource,
} from '#server/generated/prisma/enums';
import { parkDaySql } from '#server/utils/parkDaySql';
import { isConstraintViolation, UNIQUE_VIOLATION } from '#server/utils/postgresErrors';
import { COMPLETED_TRIP_STATUS } from '#server/utils/tripStatus';

/**
 * Раздел «Заявки» админки (issue #471): список с плитками и счётчиками, карточка заявки,
 * журнал отметок и таблица «Участники программы, пришли по рекламе».
 *
 * **Ждёт ответа** — заявка «Новая» или «В работе», у которой после момента ожидания нет ответа
 * сотрудника. Момент ожидания — последнее сообщение кандидата при любой доставке, а не писал —
 * подача заявки. Ответ сотрудника — его доставленное сообщение или строка журнала отметок;
 * сообщения бота ответом не считаются (docs/decisions.md → «Заявки в админке»). Правило одно
 * на список, плитки, счётчик меню и карточку — фрагментом `APPLICATION_FACTS_SQL`: второе
 * описание того же правила разошлось бы с первым, и меню показало бы одно число, а плитка другое.
 *
 * Схема в сыром SQL указывается явно: у соединения драйверного адаптера `search_path`
 * дефолтный, и запрос без префикса молча ушёл бы в `public` (docs/decisions.md).
 */

/**
 * Заявка с моментом ожидания и признаком «ждёт ответа». Даёт строки с колонками заявки и тремя
 * своими: `waiting`, `wait_anchor` — момент ожидания, `candidate_wrote` — момент взят
 * от сообщения кандидата, а не от подачи.
 */
const APPLICATION_FACTS_SQL = Prisma.sql`
  SELECT application.*,
         coalesce(candidate_last."at", application."created_at") AS "wait_anchor",
         candidate_last."at" IS NOT NULL                         AS "candidate_wrote",
         application."status" IN ('new', 'in_progress')
           AND (reply_last."at" IS NULL
                OR reply_last."at" < coalesce(candidate_last."at", application."created_at")) AS "waiting"
    FROM xb.candidate_applications AS application
    LEFT JOIN LATERAL (
           SELECT max(message."created_at") AS "at"
             FROM xb.candidate_messages AS message
            WHERE message."application_id" = application."id"
              AND message."author" = 'candidate'
         ) AS candidate_last ON TRUE
    LEFT JOIN LATERAL (
           SELECT max(reply."at") AS "at"
             FROM (
                    SELECT message."created_at" AS "at"
                      FROM xb.candidate_messages AS message
                     WHERE message."application_id" = application."id"
                       AND message."author" = 'employee'
                       AND message."delivery" = 'delivered'
                    UNION ALL
                    SELECT event."created_at" AS "at"
                      FROM xb.candidate_application_events AS event
                     WHERE event."application_id" = application."id"
                  ) AS reply
         ) AS reply_last ON TRUE
`;

/**
 * Поиск списка: подстрока имени без учёта регистра или подстрока цифр номера. Пустой поиск —
 * все заявки.
 */
export type ApplicationSearch = {
  /** Запрос, обрезанный по краям; пусто — без поиска. */
  text: string;
  /** Цифры номера из запроса; пусто — запрос не номер. */
  digits: string;
};

const searchSql = (search: ApplicationSearch): Prisma.Sql => {
  if (search.text === '') {
    return Prisma.sql`TRUE`;
  }

  // `strpos`, а не `ILIKE`: знаки `%` и `_` в запросе остаются буквами, а не шаблоном.
  const byName = Prisma.sql`strpos(lower(facts."name"), lower(${search.text})) > 0`;

  return search.digits === ''
    ? byName
    : Prisma.sql`(${byName} OR strpos(facts."phone_e164", ${search.digits}) > 0)`;
};

/** Фильтр списка: все заявки, ждущие ответа или по статусу. */
export type ApplicationRowFilter = { kind: 'all' } | { kind: 'waiting' } | { kind: 'status'; status: CandidateApplicationStatus };

const filterSql = (filter: ApplicationRowFilter): Prisma.Sql => {
  switch (filter.kind) {
    case 'all':
      return Prisma.sql`TRUE`;
    case 'waiting':
      return Prisma.sql`facts."waiting"`;
    case 'status':
      return Prisma.sql`facts."status"::text = ${filter.status}`;
  }
};

/**
 * Профиль человека — тот, что с последней поездкой, без поездок — любой его профиль: так имя
 * и позывной берёт таблица вступивших по метке (`listPromoJoined` в `repositories/promo.ts`).
 */
const personProfileSql = (personId: Prisma.Sql): Prisma.Sql => Prisma.sql`
  SELECT owned."callsign", owned."first_name", owned."last_name"
    FROM xb.park_profiles AS owned
    LEFT JOIN LATERAL (
           SELECT max(trip."ended_at") AS "ended_at"
             FROM xb.trips AS trip
            WHERE trip."profile_id" = owned."profile_id"
              AND trip."status" = ${COMPLETED_TRIP_STATUS}
         ) AS last_trip ON TRUE
   WHERE owned."person_id" = ${personId}
   ORDER BY last_trip."ended_at" DESC NULLS LAST, owned."profile_id"
   LIMIT 1
`;

export type ApplicationListRow = {
  id: string;
  name: string;
  phoneE164: string;
  phoneSource: CandidatePhoneSource;
  status: CandidateApplicationStatus;
  promoCode: string;
  promoName: string | null;
  createdAt: Date;
  match: CandidateMatch;
  lastTripDay: string | null;
  formerLinkPersonId: string | null;
  formerCallsign: string | null;
  formerFirstName: string | null;
  formerLastName: string | null;
  handledBy: string | null;
  waiting: boolean;
  waitAnchor: Date;
  candidateWrote: boolean;
};

/**
 * Страница списка заявок одним запросом. Порядок (docs/decisions.md → «Заявки в админке»):
 * ждущие ответа — дольше всех первыми; остальные «Новая» и «В работе» — новые сверху;
 * «Оформлен» и «Отказ» — новые сверху, в конце. Имена, метка и бывший водитель достаются
 * уже отрезанной странице.
 */
export const listApplicationRows = async (input: {
  search: ApplicationSearch;
  filter: ApplicationRowFilter;
  offset: number;
  limit: number;
}): Promise<ApplicationListRow[]> =>
  db.$queryRaw<ApplicationListRow[]>`
    WITH facts AS (${APPLICATION_FACTS_SQL}),
         page AS (
           SELECT facts.*,
                  CASE
                    WHEN facts."waiting" THEN 0
                    WHEN facts."status" IN ('new', 'in_progress') THEN 1
                    ELSE 2
                  END AS "row_group"
             FROM facts
            WHERE ${searchSql(input.search)}
              AND ${filterSql(input.filter)}
            ORDER BY "row_group",
                     CASE WHEN facts."waiting" THEN facts."wait_anchor" END ASC,
                     facts."created_at" DESC,
                     facts."id"
            LIMIT ${input.limit}
           OFFSET ${input.offset}
         )
    SELECT page."id",
           page."name",
           page."phone_e164"                         AS "phoneE164",
           page."phone_source"::text                 AS "phoneSource",
           page."status"::text                       AS "status",
           page."promo_code"                         AS "promoCode",
           link."name"                               AS "promoName",
           page."created_at"                         AS "createdAt",
           page."match"::text                        AS "match",
           to_char(page."last_trip_day", 'YYYY-MM-DD') AS "lastTripDay",
           page."former_link_person_id"              AS "formerLinkPersonId",
           former."callsign"                         AS "formerCallsign",
           former."first_name"                       AS "formerFirstName",
           former."last_name"                        AS "formerLastName",
           handler."full_name"                       AS "handledBy",
           page."waiting",
           page."wait_anchor"                        AS "waitAnchor",
           page."candidate_wrote"                    AS "candidateWrote"
      FROM page
      LEFT JOIN xb.promo_links AS link ON link."code" = page."promo_code"
      LEFT JOIN xb.employees AS handler ON handler."id" = page."handled_by_employee_id"
      LEFT JOIN LATERAL (${personProfileSql(Prisma.sql`page."former_link_person_id"`)}) AS former ON TRUE
     ORDER BY page."row_group",
              CASE WHEN page."waiting" THEN page."wait_anchor" END ASC,
              page."created_at" DESC,
              page."id"
  `;

export type ApplicationTotalsRow = {
  waiting: number;
  overdue: number;
  total: number;
  totalWeek: number;
  hired: number;
  hiredWeek: number;
  countAll: number;
  countWaiting: number;
  countNew: number;
  countInProgress: number;
  countHired: number;
  countRejected: number;
};

/**
 * Плитки — по всем заявкам, без фильтра и поиска, — и число у каждой пилюли с учётом поиска.
 *
 * «За 7 дней» у оформленных — по последней отметке «Оформлен» заявки, которая сейчас
 * «Оформлен»: оформленная, возвращённая в работу и оформленная снова считается по второй.
 */
export const readApplicationTotals = async (input: {
  search: ApplicationSearch;
  /** Ждущие ответа с моментом ожидания раньше этого — «Дольше суток». */
  overdueBefore: Date;
  /** Первые сутки окна «за 7 дней» по Ташкенту, `YYYY-MM-DD`. */
  weekFromDay: string;
}): Promise<ApplicationTotalsRow> => {
  const matches = searchSql(input.search);
  const rows = await db.$queryRaw<ApplicationTotalsRow[]>`
    WITH facts AS (${APPLICATION_FACTS_SQL})
    SELECT count(*) FILTER (WHERE facts."waiting")::int AS "waiting",
           count(*) FILTER (WHERE facts."waiting" AND facts."wait_anchor" < ${input.overdueBefore})::int AS "overdue",
           count(*)::int AS "total",
           count(*) FILTER (
             WHERE ${parkDaySql(Prisma.sql`facts."created_at"`)} >= ${input.weekFromDay}::date
           )::int AS "totalWeek",
           count(*) FILTER (WHERE facts."status" = 'hired')::int AS "hired",
           count(*) FILTER (
             WHERE facts."status" = 'hired'
               AND ${parkDaySql(Prisma.sql`hired_last."at"`)} >= ${input.weekFromDay}::date
           )::int AS "hiredWeek",
           count(*) FILTER (WHERE ${matches})::int AS "countAll",
           count(*) FILTER (WHERE ${matches} AND facts."waiting")::int AS "countWaiting",
           count(*) FILTER (WHERE ${matches} AND facts."status" = 'new')::int AS "countNew",
           count(*) FILTER (WHERE ${matches} AND facts."status" = 'in_progress')::int AS "countInProgress",
           count(*) FILTER (WHERE ${matches} AND facts."status" = 'hired')::int AS "countHired",
           count(*) FILTER (WHERE ${matches} AND facts."status" = 'rejected')::int AS "countRejected"
      FROM facts
      LEFT JOIN LATERAL (
             SELECT max(event."created_at") AS "at"
               FROM xb.candidate_application_events AS event
              WHERE event."application_id" = facts."id"
                AND event."kind" = 'hired'
           ) AS hired_last ON TRUE
  `;
  const totals = rows[0];

  if (totals === undefined) {
    throw new Error('итоги заявок не вернули строку');
  }

  return totals;
};

/** Сколько заявок ждёт ответа — счётчик у пункта меню. */
export const countWaitingApplications = async (): Promise<number> => {
  const rows = await db.$queryRaw<{ count: number }[]>`
    WITH facts AS (${APPLICATION_FACTS_SQL})
    SELECT count(*)::int AS "count" FROM facts WHERE facts."waiting"
  `;

  return rows[0]?.count ?? 0;
};

export type ApplicationWaitingRow = {
  waiting: boolean;
  waitAnchor: Date;
  candidateWrote: boolean;
};

/** Ждёт ли заявка ответа и с какого момента — для карточки. `null` — заявки нет. */
export const findApplicationWaiting = async (applicationId: string): Promise<ApplicationWaitingRow | null> => {
  const rows = await db.$queryRaw<ApplicationWaitingRow[]>`
    WITH facts AS (${APPLICATION_FACTS_SQL} WHERE application."id" = ${applicationId}::uuid)
    SELECT facts."waiting", facts."wait_anchor" AS "waitAnchor", facts."candidate_wrote" AS "candidateWrote"
      FROM facts
  `;

  return rows[0] ?? null;
};

/**
 * Последнее касание рекламной метки каждым участником программы: касание с человеком и признаком
 * «был участником», метка с носителем «Реклама в Telegram». Демо-люди не входят: демо не входит
 * ни в одну общую цифру (docs/decisions.md → «Демо не входит ни в одну общую цифру»).
 */
const AD_PARTICIPANT_TOUCHES_SQL = Prisma.sql`
  SELECT DISTINCT ON (touch."person_id")
         touch."person_id", touch."code", touch."touched_at"
    FROM xb.promo_touches AS touch
    JOIN xb.promo_links AS link ON link."code" = touch."code" AND link."medium" = 'telegram_ad'
    JOIN xb.persons AS person ON person."id" = touch."person_id" AND NOT person."is_demo"
   WHERE touch."was_participant"
     AND touch."person_id" IS NOT NULL
   ORDER BY touch."person_id", touch."touched_at" DESC, touch."id" DESC
`;

export type AdParticipantListRow = {
  personId: string;
  callsign: string | null;
  firstName: string | null;
  lastName: string | null;
  promoName: string | null;
  promoCode: string;
  touchedAt: Date;
  lastTripAt: Date | null;
};

/** Страница «Участники программы, пришли по рекламе» — строка на человека, новые сверху. */
export const listAdParticipantRows = async (offset: number, limit: number): Promise<AdParticipantListRow[]> =>
  db.$queryRaw<AdParticipantListRow[]>`
    WITH latest AS (${AD_PARTICIPANT_TOUCHES_SQL}),
         page AS (
           SELECT latest.*
             FROM latest
            ORDER BY latest."touched_at" DESC, latest."person_id"
            LIMIT ${limit}
           OFFSET ${offset}
         )
    SELECT page."person_id"   AS "personId",
           profile."callsign",
           profile."first_name" AS "firstName",
           profile."last_name"  AS "lastName",
           link."name"          AS "promoName",
           page."code"          AS "promoCode",
           page."touched_at"    AS "touchedAt",
           last_trip."at"       AS "lastTripAt"
      FROM page
      LEFT JOIN xb.promo_links AS link ON link."code" = page."code"
      LEFT JOIN LATERAL (${personProfileSql(Prisma.sql`page."person_id"`)}) AS profile ON TRUE
      LEFT JOIN LATERAL (
             SELECT max(trip."ended_at") AS "at"
               FROM xb.trips AS trip
               JOIN xb.park_profiles AS owned ON owned."profile_id" = trip."profile_id"
              WHERE owned."person_id" = page."person_id"
                AND trip."status" = ${COMPLETED_TRIP_STATUS}
           ) AS last_trip ON TRUE
     ORDER BY page."touched_at" DESC, page."person_id"
  `;

export const countAdParticipants = async (): Promise<number> => {
  const rows = await db.$queryRaw<{ count: number }[]>`
    WITH latest AS (${AD_PARTICIPANT_TOUCHES_SQL})
    SELECT count(*)::int AS "count" FROM latest
  `;

  return rows[0]?.count ?? 0;
};

/** Заявка для карточки админки. */
export type ApplicationCardRow = {
  id: string;
  name: string;
  phoneE164: string;
  phoneSource: CandidatePhoneSource;
  telegramUserId: bigint;
  telegramName: string;
  telegramUsername: string | null;
  writeAllowed: boolean;
  status: CandidateApplicationStatus;
  channel: CandidateApplicationChannel;
  promoCode: string;
  match: CandidateMatch;
  lastTripDay: Date | null;
  matchedPersonId: string | null;
  formerLinkPersonId: string | null;
  forumChatId: bigint | null;
  forumTopicId: number | null;
  createdAt: Date;
  handledByEmployee: { fullName: string } | null;
};

export const findApplicationCard = async (applicationId: string): Promise<ApplicationCardRow | null> =>
  db.candidateApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      name: true,
      phoneE164: true,
      phoneSource: true,
      telegramUserId: true,
      telegramName: true,
      telegramUsername: true,
      writeAllowed: true,
      status: true,
      channel: true,
      promoCode: true,
      match: true,
      lastTripDay: true,
      matchedPersonId: true,
      formerLinkPersonId: true,
      forumChatId: true,
      forumTopicId: true,
      createdAt: true,
      handledByEmployee: { select: { fullName: true } },
    },
  });

export type ApplicationMessageRow = {
  id: string;
  author: CandidateMessageAuthor;
  kind: CandidateMessageKind;
  text: string | null;
  delivery: CandidateMessageDelivery;
  failure: CandidateMessageFailure | null;
  createdAt: Date;
  employee: { fullName: string } | null;
};

/** Переписка заявки по времени. */
export const listApplicationMessages = async (applicationId: string): Promise<ApplicationMessageRow[]> =>
  db.candidateMessage.findMany({
    where: { applicationId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      author: true,
      kind: true,
      text: true,
      delivery: true,
      failure: true,
      createdAt: true,
      employee: { select: { fullName: true } },
    },
  });

export type ApplicationEventRow = {
  kind: CandidateApplicationEventKind;
  createdAt: Date;
  employee: { fullName: string };
};

/** Журнал отметок заявки по времени. */
export const listApplicationEvents = async (applicationId: string): Promise<ApplicationEventRow[]> =>
  db.candidateApplicationEvent.findMany({
    where: { applicationId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { kind: true, createdAt: true, employee: { select: { fullName: true } } },
  });

/** Название метки; `null` — метки с таким кодом нет: внешнего ключа у кода заявки нет. */
export const findPromoLinkName = async (code: string): Promise<string | null> =>
  (await db.promoLink.findUnique({ where: { code }, select: { name: true } }))?.name ?? null;

/** Последнее касание этой метки этим Telegram не позже момента. */
export const findLastPromoTouchBefore = async (
  code: string,
  telegramUserId: bigint,
  before: Date,
): Promise<Date | null> =>
  (
    await db.promoTouch.findFirst({
      where: { code, telegramUserId, touchedAt: { lte: before } },
      orderBy: [{ touchedAt: 'desc' }, { id: 'desc' }],
      select: { touchedAt: true },
    })
  )?.touchedAt ?? null;

/**
 * Первая завершённая поездка не раньше подачи заявки — у человека, к которому этот Telegram
 * привязан после неё: первая такая привязка. Поездки до заявки не считаются — у того, кто
 * работал раньше, первая поездка за всё время встала бы раньше самой заявки.
 */
export const findFirstTripAfterApplication = async (
  telegramUserId: bigint,
  submittedAt: Date,
): Promise<Date | null> => {
  const rows = await db.$queryRaw<{ at: Date | null }[]>`
    WITH linked AS (
      SELECT telegram_link."person_id"
        FROM xb.telegram_links AS telegram_link
       WHERE telegram_link."telegram_user_id" = ${telegramUserId.toString()}::text::bigint
         AND telegram_link."linked_at" > ${submittedAt}
       ORDER BY telegram_link."linked_at", telegram_link."id"
       LIMIT 1
    )
    SELECT min(trip."ended_at") AS "at"
      FROM linked
      JOIN xb.park_profiles AS owned ON owned."person_id" = linked."person_id"
      JOIN xb.trips AS trip ON trip."profile_id" = owned."profile_id"
     WHERE trip."status" = ${COMPLETED_TRIP_STATUS}
       AND trip."ended_at" >= ${submittedAt}
  `;

  return rows[0]?.at ?? null;
};

export type ApplicationMarkOutcome = 'marked' | 'not_found' | 'transition_invalid' | 'open_application_exists';

/**
 * Частичные уникальные индексы открытой заявки — одна «Новая» или «В работе» на Telegram и на номер,
 * подтверждённый Telegram (миграция `20261011090000_candidate_applications`).
 */
const OPEN_APPLICATION_INDEXES = ['candidate_applications_open_telegram_key', 'candidate_applications_open_phone_key'];

const isOpenApplicationConflict = (error: unknown): boolean =>
  OPEN_APPLICATION_INDEXES.some((index) => isConstraintViolation(error, UNIQUE_VIOLATION, index));

/**
 * Отметка сотрудника: статус, строка журнала и пустой «ведёт» — одной транзакцией. Статус
 * меняется, только если нынешний — из `fromStatuses`: вторая отметка той же заявки, поставленная
 * одновременно, ждёт первую на блокировке строки и находит статус уже сменённым.
 *
 * Возврат в работу открывает заявку, а открытая заявка одна на Telegram и на номер из Telegram
 * (docs/decisions.md → «Заявка кандидата»). Если у кандидата уже есть другая открытая — кандидат
 * подал новую, пока эта была закрыта, — смену статуса отбивает индекс, транзакция откатывается
 * целиком, и это исход `open_application_exists`, а не ошибка.
 *
 * `closeChatDraft` — заодно закрыть этой заявкой незаконченный черновик заявки в чате этого
 * Telegram: заявка снова открыта, и сообщения кандидата должны идти в её тему, а не в черновик
 * (как у `startChatDraft`, нашедшего открытую заявку).
 */
export const markApplicationStatus = async (input: {
  applicationId: string;
  fromStatuses: readonly CandidateApplicationStatus[];
  status: CandidateApplicationStatus;
  eventKind: CandidateApplicationEventKind;
  employeeId: string;
  closeChatDraft: boolean;
}): Promise<ApplicationMarkOutcome> => {
  try {
    return await db.$transaction(async (transaction): Promise<ApplicationMarkOutcome> => {
      const updated = await transaction.candidateApplication.updateMany({
        where: { id: input.applicationId, status: { in: [...input.fromStatuses] } },
        data: { status: input.status },
      });

      if (updated.count === 0) {
        const exists = await transaction.candidateApplication.count({ where: { id: input.applicationId } });

        return exists > 0 ? 'transition_invalid' : 'not_found';
      }

      await transaction.candidateApplicationEvent.create({
        data: { applicationId: input.applicationId, kind: input.eventKind, employeeId: input.employeeId },
      });
      await transaction.candidateApplication.updateMany({
        where: { id: input.applicationId, handledByEmployeeId: null },
        data: { handledByEmployeeId: input.employeeId },
      });

      if (input.closeChatDraft) {
        const application = await transaction.candidateApplication.findUniqueOrThrow({
          where: { id: input.applicationId },
          select: { telegramUserId: true },
        });

        await transaction.candidateChatDraft.updateMany({
          where: { telegramUserId: application.telegramUserId, applicationId: null },
          data: { applicationId: input.applicationId },
        });
      }

      return 'marked';
    });
  } catch (error) {
    if (isOpenApplicationConflict(error)) {
      return 'open_application_exists';
    }

    throw error;
  }
};

/** Заявка для пересверки номера. */
export const findApplicationMatch = async (
  applicationId: string,
): Promise<{ match: CandidateMatch; phoneE164: string } | null> =>
  db.candidateApplication.findUnique({ where: { id: applicationId }, select: { match: true, phoneE164: true } });

/**
 * Записывает итог пересверки — только если заявка всё ещё без сверки: две пересверки подряд
 * не перетирают друг друга.
 */
export const recordApplicationMatch = async (
  applicationId: string,
  result: {
    match: CandidateMatch;
    personId: string | null;
    profileId: string | null;
    /** `YYYY-MM-DD`. */
    lastTripDay: string | null;
  },
): Promise<boolean> => {
  const updated = await db.candidateApplication.updateMany({
    where: { id: applicationId, match: 'lookup_failed' },
    data: {
      match: result.match,
      matchedPersonId: result.personId,
      matchedProfileId: result.profileId,
      lastTripDay: result.lastTripDay === null ? null : new Date(`${result.lastTripDay}T00:00:00Z`),
    },
  });

  return updated.count > 0;
};
