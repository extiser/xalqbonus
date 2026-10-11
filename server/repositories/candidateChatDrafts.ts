import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';
import type {
  CandidateDraftMessageAuthor,
  CandidateDraftStep,
  CandidateMessageDelivery,
  CandidateMessageFailure,
  CandidateMessageKind,
  Language,
} from '#server/generated/prisma/enums';

/**
 * Черновики заявки в чате бота (issue #467), сообщения в них и «Не закончили» в админке заявок
 * (issue #475).
 *
 * Незаконченный черновик — без заявки — один на Telegram: его держит частичный уникальный индекс
 * `candidate_chat_drafts_open_key`, и `/start` по метке начинает тот же черновик заново, а не заводит
 * второй. Повтор апдейта гасит уникальный индекс сообщения черновика.
 *
 * **Написал сам** — сообщение человека, кроме контакта: контакт — шаг заявки, а не вопрос.
 * **Ждёт ответа** — после последнего такого сообщения нет доставленного ответа сотрудника; момент
 * ожидания — время этого сообщения. Правило одно на список, плитки и карточку — фрагментом
 * `DRAFT_FACTS_SQL` (docs/decisions.md → «„Не закончили“ в заявках»).
 *
 * Схема в сыром SQL указывается явно: у соединения драйверного адаптера `search_path`
 * дефолтный, и запрос без префикса молча ушёл бы в `public` (docs/decisions.md).
 */

export type CandidateChatDraftRow = {
  id: string;
  telegramUserId: bigint;
  telegramChatId: bigint;
  promoCode: string;
  language: Language;
  step: CandidateDraftStep;
  /** Заполнены ровно при `awaiting_name`. */
  phoneRaw: string | null;
  phoneE164: string | null;
};

const DRAFT_SELECT = {
  id: true,
  telegramUserId: true,
  telegramChatId: true,
  promoCode: true,
  language: true,
  step: true,
  phoneRaw: true,
  phoneE164: true,
} as const;

/** Незаконченный черновик этого Telegram. */
export const findOpenChatDraftByTelegram = async (telegramUserId: bigint): Promise<CandidateChatDraftRow | null> =>
  db.candidateChatDraft.findFirst({
    where: { telegramUserId, applicationId: null },
    select: DRAFT_SELECT,
  });

/** Черновик по идентификатору, если он ещё не закончен. */
export const findOpenChatDraftById = async (draftId: string): Promise<CandidateChatDraftRow | null> =>
  db.candidateChatDraft.findFirst({
    where: { id: draftId, applicationId: null },
    select: DRAFT_SELECT,
  });

export type OpenChatDraftInput = {
  telegramUserId: bigint;
  telegramChatId: bigint;
  telegramName: string;
  telegramUsername: string | null;
  promoCode: string;
  language: Language;
  startedAt: Date;
};

/**
 * Начинает черновик или начинает заново незаконченный: шаг — ждём номер, номер стирается, метка,
 * язык и имя из Telegram — нынешнего `/start`. Убранный из «Не закончили» возвращается в список;
 * кто ведёт, не стирается.
 *
 * Сырым запросом ради `ON CONFLICT … DO UPDATE` по частичному индексу: типизированный `upsert`
 * Prisma цели с условием не знает, а проверка «есть ли уже» перед вставкой разошлась бы с двумя
 * быстрыми `/start`. Индекс частичный, поэтому указан колонкой и условием, а не именем.
 */
export const upsertOpenChatDraft = async (input: OpenChatDraftInput): Promise<CandidateChatDraftRow> => {
  const rows = await db.$queryRaw<CandidateChatDraftRow[]>`
    INSERT INTO xb.candidate_chat_drafts (
      "telegram_user_id", "telegram_chat_id", "telegram_name", "telegram_username",
      "promo_code", "language", "step", "started_at"
    )
    VALUES (
      ${input.telegramUserId.toString()}::text::bigint,
      ${input.telegramChatId.toString()}::text::bigint,
      ${input.telegramName},
      ${input.telegramUsername},
      ${input.promoCode},
      ${input.language}::xb.language,
      'awaiting_contact'::xb.candidate_draft_step,
      ${input.startedAt}::timestamptz
    )
    ON CONFLICT ("telegram_user_id") WHERE "application_id" IS NULL DO UPDATE
       SET "telegram_chat_id"  = EXCLUDED."telegram_chat_id",
           "telegram_name"     = EXCLUDED."telegram_name",
           "telegram_username" = EXCLUDED."telegram_username",
           "promo_code"        = EXCLUDED."promo_code",
           "language"          = EXCLUDED."language",
           "step"              = EXCLUDED."step",
           "phone_raw"         = NULL,
           "phone_e164"        = NULL,
           "phone_message_id"  = NULL,
           "dismissed_at"      = NULL,
           "dismissed_by_employee_id" = NULL,
           "started_at"        = EXCLUDED."started_at",
           "updated_at"        = now()
    RETURNING "id",
              "telegram_user_id" AS "telegramUserId",
              "telegram_chat_id" AS "telegramChatId",
              "promo_code"       AS "promoCode",
              "language"::text   AS "language",
              "step"::text       AS "step",
              "phone_raw"        AS "phoneRaw",
              "phone_e164"       AS "phoneE164"
  `;

  const row = rows[0];

  if (row === undefined) {
    throw new Error('черновик заявки в чате не вернул строку');
  }

  return row;
};

/**
 * Номер из контакта — в черновик вместе с сообщением-контактом, шаг — ждём имя. `false` — черновик
 * уже закончен или уже не ждёт номера.
 */
export const recordChatDraftPhone = async (
  draftId: string,
  phone: { phoneRaw: string; phoneE164: string; phoneMessageId: string },
): Promise<boolean> => {
  const { count } = await db.candidateChatDraft.updateMany({
    where: { id: draftId, applicationId: null, step: 'awaiting_contact' },
    data: {
      step: 'awaiting_name',
      phoneRaw: phone.phoneRaw,
      phoneE164: phone.phoneE164,
      phoneMessageId: phone.phoneMessageId,
    },
  });

  return count === 1;
};

/** Возвращает убранного в «Не закончили»: человек написал в черновик снова. */
export const restoreDismissedChatDraft = async (draftId: string): Promise<void> => {
  await db.candidateChatDraft.updateMany({
    where: { id: draftId, dismissedAt: { not: null } },
    data: { dismissedAt: null, dismissedByEmployeeId: null },
  });
};

/** Закрывает черновик заявкой — только незаконченный: закрытый другой заявкой не перетирается. */
export const closeChatDraft = async (draftId: string, applicationId: string): Promise<boolean> => {
  const { count } = await db.candidateChatDraft.updateMany({
    where: { id: draftId, applicationId: null },
    data: { applicationId },
  });

  return count === 1;
};

export type ChatDraftMessageInput = {
  draftId: string;
  kind: CandidateMessageKind;
  text: string | null;
  fileId: string | null;
  candidateMessageId: number;
};

/**
 * Пишет сообщение человека в черновик и отдаёт его `id`. `null` — повтор апдейта: уникальный индекс
 * (`draft_id`, `candidate_message_id`) отбил вставку (`ON CONFLICT DO NOTHING`), и это исход,
 * а не ошибка.
 */
export const insertChatDraftMessage = async (input: ChatDraftMessageInput): Promise<string | null> => {
  const rows = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO xb.candidate_draft_messages (
      "draft_id", "author", "kind", "text", "file_id", "candidate_message_id", "delivery"
    )
    VALUES (
      ${input.draftId}::uuid,
      'person'::xb.candidate_draft_message_author,
      ${input.kind}::xb.candidate_message_kind,
      ${input.text},
      ${input.fileId},
      ${input.candidateMessageId}::int,
      'delivered'::xb.candidate_message_delivery
    )
    ON CONFLICT DO NOTHING
    RETURNING "id"
  `;

  return rows[0]?.id ?? null;
};

// ---------------------------------------------------------------------------
// «Не закончили» в админке заявок (issue #475)
// ---------------------------------------------------------------------------

/**
 * Черновик с фактами ожидания. Даёт строки с колонками черновика и тремя своими: `waiting`,
 * `wait_anchor` — время последнего сообщения «написал сам», `replied` — человеку уже доставлен
 * хотя бы один ответ сотрудника.
 */
const DRAFT_FACTS_SQL = Prisma.sql`
  SELECT draft.*,
         person_last."at"                                AS "wait_anchor",
         person_last."at" IS NOT NULL
           AND (reply_last."at" IS NULL OR reply_last."at" < person_last."at") AS "waiting",
         reply_last."at" IS NOT NULL                     AS "replied"
    FROM xb.candidate_chat_drafts AS draft
    LEFT JOIN LATERAL (
           SELECT max(message."created_at") AS "at"
             FROM xb.candidate_draft_messages AS message
            WHERE message."draft_id" = draft."id"
              AND message."author" = 'person'
              AND message."kind" <> 'contact'
         ) AS person_last ON TRUE
    LEFT JOIN LATERAL (
           SELECT max(message."created_at") AS "at"
             FROM xb.candidate_draft_messages AS message
            WHERE message."draft_id" = draft."id"
              AND message."author" = 'employee'
              AND message."delivery" = 'delivered'
         ) AS reply_last ON TRUE
`;

/**
 * Строка `facts` из `DRAFT_FACTS_SQL` стоит в «Не закончили»: черновик не закончен и не убран, его
 * Telegram не участник программы и не сотрудник — как `isProgramTelegram`, привязка по чату, — и
 * с `/start` прошло `visibleBefore` или человек ждёт ответа.
 */
const unfinishedVisibleSql = (visibleBefore: Date): Prisma.Sql => Prisma.sql`
  facts."application_id" IS NULL
  AND facts."dismissed_at" IS NULL
  AND (facts."waiting" OR facts."started_at" < ${visibleBefore})
  AND NOT EXISTS (
        SELECT 1
          FROM xb.telegram_links AS link
         WHERE link."closed_at" IS NULL
           AND link."telegram_chat_id" = facts."telegram_user_id"
      )
  AND NOT EXISTS (
        SELECT 1
          FROM xb.employees AS employee
         WHERE employee."telegram_user_id" = facts."telegram_user_id"
      )
`;

/** Поиск «Не закончили»: как у заявок — запрос, обрезанный по краям, и цифры номера из него. */
export type UnfinishedSearch = {
  text: string;
  digits: string;
};

/**
 * Подстрока имени из Telegram или `@имени` без учёта регистра, или подстрока цифр номера. `@имя`
 * сравнивается с приставкой: так находит и «@dilshod», и «dilshod».
 */
const unfinishedSearchSql = (search: UnfinishedSearch): Prisma.Sql => {
  if (search.text === '') {
    return Prisma.sql`TRUE`;
  }

  // `strpos`, а не `ILIKE`: знаки `%` и `_` в запросе остаются буквами, а не шаблоном.
  const byName = Prisma.sql`(
    strpos(lower(facts."telegram_name"), lower(${search.text})) > 0
    OR strpos(lower('@' || coalesce(facts."telegram_username", '')), lower(${search.text})) > 0
  )`;

  return search.digits === ''
    ? byName
    : Prisma.sql`(${byName} OR strpos(coalesce(facts."phone_e164", ''), ${search.digits}) > 0)`;
};

/**
 * Число людей в «Не закончили» и ждущих из них — для плиток и пилюли списка заявок. Фрагмент
 * подзапросов: итоги заявок берут его в свой запрос (`readApplicationTotals`), а не вторым проходом.
 */
export const unfinishedTotalsSql = (input: { visibleBefore: Date; search: UnfinishedSearch }): Prisma.Sql => Prisma.sql`
  (
    SELECT count(*) FILTER (WHERE facts."waiting")::int
      FROM (${DRAFT_FACTS_SQL}) AS facts
     WHERE ${unfinishedVisibleSql(input.visibleBefore)}
  ) AS "waitingUnfinished",
  (
    SELECT count(*)::int
      FROM (${DRAFT_FACTS_SQL}) AS facts
     WHERE ${unfinishedVisibleSql(input.visibleBefore)}
       AND ${unfinishedSearchSql(input.search)}
  ) AS "countUnfinished"
`;

export type UnfinishedListRow = {
  id: string;
  telegramName: string;
  telegramUsername: string | null;
  telegramUserId: string;
  step: CandidateDraftStep;
  phoneE164: string | null;
  promoName: string | null;
  promoCode: string;
  startedAt: Date;
  handledBy: string | null;
  waitingSince: Date | null;
};

/**
 * Страница «Не закончили» одним запросом. Порядок: ждут ответа — дольше всех первыми; кому ещё
 * никто не писал — свежие первыми; кому уже писали — свежие первыми. Метка и ведущий достаются
 * уже отрезанной странице.
 */
export const listUnfinishedRows = async (input: {
  visibleBefore: Date;
  search: UnfinishedSearch;
  offset: number;
  limit: number;
}): Promise<UnfinishedListRow[]> =>
  db.$queryRaw<UnfinishedListRow[]>`
    WITH facts AS (${DRAFT_FACTS_SQL}),
         page AS (
           SELECT facts.*,
                  CASE
                    WHEN facts."waiting" THEN 0
                    WHEN NOT facts."replied" THEN 1
                    ELSE 2
                  END AS "row_group"
             FROM facts
            WHERE ${unfinishedVisibleSql(input.visibleBefore)}
              AND ${unfinishedSearchSql(input.search)}
            ORDER BY "row_group",
                     CASE WHEN facts."waiting" THEN facts."wait_anchor" END ASC,
                     facts."started_at" DESC,
                     facts."id"
            LIMIT ${input.limit}
           OFFSET ${input.offset}
         )
    SELECT page."id",
           page."telegram_name"           AS "telegramName",
           page."telegram_username"       AS "telegramUsername",
           page."telegram_user_id"::text  AS "telegramUserId",
           page."step"::text              AS "step",
           page."phone_e164"              AS "phoneE164",
           link."name"                    AS "promoName",
           page."promo_code"              AS "promoCode",
           page."started_at"              AS "startedAt",
           handler."full_name"            AS "handledBy",
           CASE WHEN page."waiting" THEN page."wait_anchor" END AS "waitingSince"
      FROM page
      LEFT JOIN xb.promo_links AS link ON link."code" = page."promo_code"
      LEFT JOIN xb.employees AS handler ON handler."id" = page."handled_by_employee_id"
     ORDER BY page."row_group",
              CASE WHEN page."waiting" THEN page."wait_anchor" END ASC,
              page."started_at" DESC,
              page."id"
  `;

/** Сколько людей в «Не закончили» под поиском. */
export const countUnfinished = async (input: { visibleBefore: Date; search: UnfinishedSearch }): Promise<number> => {
  const rows = await db.$queryRaw<{ count: number }[]>`
    WITH facts AS (${DRAFT_FACTS_SQL})
    SELECT count(*)::int AS "count"
      FROM facts
     WHERE ${unfinishedVisibleSql(input.visibleBefore)}
       AND ${unfinishedSearchSql(input.search)}
  `;

  return rows[0]?.count ?? 0;
};

/** С какого момента черновик ждёт ответа — для карточки; `null` — не ждёт или черновика нет. */
export const findDraftWaitingSince = async (draftId: string): Promise<Date | null> => {
  const rows = await db.$queryRaw<{ waitingSince: Date | null }[]>`
    WITH facts AS (${DRAFT_FACTS_SQL} WHERE draft."id" = ${draftId}::uuid)
    SELECT CASE WHEN facts."waiting" THEN facts."wait_anchor" END AS "waitingSince"
      FROM facts
  `;

  return rows[0]?.waitingSince ?? null;
};

/** Черновик для карточки «Не закончили» — любой: закончен, убран или нет. */
export type DraftCardRow = {
  id: string;
  telegramUserId: bigint;
  telegramName: string;
  telegramUsername: string | null;
  step: CandidateDraftStep;
  phoneE164: string | null;
  promoCode: string;
  startedAt: Date;
  applicationId: string | null;
  phoneMessageId: string | null;
  dismissedAt: Date | null;
  handledByEmployee: { fullName: string } | null;
  phoneMessage: { createdAt: Date } | null;
};

export const findDraftCard = async (draftId: string): Promise<DraftCardRow | null> =>
  db.candidateChatDraft.findUnique({
    where: { id: draftId },
    select: {
      id: true,
      telegramUserId: true,
      telegramName: true,
      telegramUsername: true,
      step: true,
      phoneE164: true,
      promoCode: true,
      startedAt: true,
      applicationId: true,
      phoneMessageId: true,
      dismissedAt: true,
      handledByEmployee: { select: { fullName: true } },
      phoneMessage: { select: { createdAt: true } },
    },
  });

export type DraftMessageRow = {
  id: string;
  author: CandidateDraftMessageAuthor;
  kind: CandidateMessageKind;
  text: string | null;
  delivery: CandidateMessageDelivery;
  failure: CandidateMessageFailure | null;
  createdAt: Date;
  employee: { fullName: string } | null;
};

const DRAFT_MESSAGE_SELECT = {
  id: true,
  author: true,
  kind: true,
  text: true,
  delivery: true,
  failure: true,
  createdAt: true,
  employee: { select: { fullName: true } },
} as const;

/** Сообщения черновика по времени. */
export const listDraftMessages = async (draftId: string): Promise<DraftMessageRow[]> =>
  db.candidateDraftMessage.findMany({
    where: { draftId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: DRAFT_MESSAGE_SELECT,
  });

export type ApplicationDraftRow = {
  id: string;
  promoCode: string;
  phoneE164: string | null;
  phoneMessageId: string | null;
  startedAt: Date;
  messages: DraftMessageRow[];
};

/** Черновики, которыми кончилась заявка, с их сообщениями — по времени начала. */
export const listApplicationDrafts = async (applicationId: string): Promise<ApplicationDraftRow[]> =>
  db.candidateChatDraft.findMany({
    where: { applicationId },
    orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      promoCode: true,
      phoneE164: true,
      phoneMessageId: true,
      startedAt: true,
      messages: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: DRAFT_MESSAGE_SELECT },
    },
  });

/** Черновик для ответа из админки: чат человека и закончен ли он. */
export const findDraftForReply = async (
  draftId: string,
): Promise<{ id: string; telegramChatId: bigint; applicationId: string | null } | null> =>
  db.candidateChatDraft.findUnique({
    where: { id: draftId },
    select: { id: true, telegramChatId: true, applicationId: true },
  });

/** Строка ответа сотрудника `pending` — до отправки. */
export const insertDraftReply = async (input: { draftId: string; employeeId: string; text: string }): Promise<string> =>
  (
    await db.candidateDraftMessage.create({
      data: {
        draftId: input.draftId,
        author: 'employee',
        employeeId: input.employeeId,
        kind: 'text',
        text: input.text,
        delivery: 'pending',
      },
      select: { id: true },
    })
  ).id;

/**
 * Ответ сотрудника доставлен — и вместе с этим, одной транзакцией, ведущим черновика становится
 * ответивший, если ведущего ещё нет. `candidateMessageId` пуст, когда отправку заглушила защита
 * вне прода: ноль в строке спутал бы индекс повтора апдейта.
 */
export const markDraftReplyDelivered = async (input: {
  messageId: string;
  candidateMessageId: number | null;
  draftId: string;
  employeeId: string;
}): Promise<void> => {
  await db.$transaction([
    db.candidateDraftMessage.update({
      where: { id: input.messageId },
      data: { delivery: 'delivered', candidateMessageId: input.candidateMessageId },
    }),
    db.candidateChatDraft.updateMany({
      where: { id: input.draftId, handledByEmployeeId: null },
      data: { handledByEmployeeId: input.employeeId },
    }),
  ]);
};

/** Ответ не доставлен: Telegram отказал. */
export const markDraftReplyFailed = async (messageId: string, failure: CandidateMessageFailure): Promise<void> => {
  await db.candidateDraftMessage.update({
    where: { id: messageId },
    data: { delivery: 'failed', failure },
  });
};

export type DraftDismissOutcome = 'dismissed' | 'already_dismissed' | 'not_found' | 'closed';

/** «Убрать из списка»: только незаконченный и ещё не убранный черновик. */
export const dismissDraft = async (draftId: string, employeeId: string): Promise<DraftDismissOutcome> => {
  const { count } = await db.candidateChatDraft.updateMany({
    where: { id: draftId, applicationId: null, dismissedAt: null },
    data: { dismissedAt: new Date(), dismissedByEmployeeId: employeeId },
  });

  if (count === 1) {
    return 'dismissed';
  }

  const draft = await db.candidateChatDraft.findUnique({
    where: { id: draftId },
    select: { applicationId: true },
  });

  if (draft === null) return 'not_found';

  return draft.applicationId === null ? 'already_dismissed' : 'closed';
};

/** Названия меток по кодам; метки без строки в `promo_links` в ответе нет. */
export const findPromoLinkNames = async (codes: readonly string[]): Promise<Map<string, string>> => {
  if (codes.length === 0) {
    return new Map();
  }

  const links = await db.promoLink.findMany({ where: { code: { in: [...codes] } }, select: { code: true, name: true } });

  return new Map(links.map((link) => [link.code, link.name]));
};
