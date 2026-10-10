import { db } from '#server/db';
import type { CandidateDraftStep, CandidateMessageKind, Language } from '#server/generated/prisma/enums';

/**
 * Черновики заявки в чате бота (issue #467) и сообщения кандидата в них.
 *
 * Незаконченный черновик — без заявки — один на Telegram: его держит частичный уникальный индекс
 * `candidate_chat_drafts_open_key`, и `/start` по метке начинает тот же черновик заново, а не заводит
 * второй. Повтор апдейта гасит уникальный индекс сообщения черновика.
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
 * язык и имя из Telegram — нынешнего `/start`.
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
 * Номер из контакта — в черновик, шаг — ждём имя. `false` — черновик уже закончен или уже
 * не ждёт номера.
 */
export const recordChatDraftPhone = async (
  draftId: string,
  phone: { phoneRaw: string; phoneE164: string },
): Promise<boolean> => {
  const { count } = await db.candidateChatDraft.updateMany({
    where: { id: draftId, applicationId: null, step: 'awaiting_contact' },
    data: { step: 'awaiting_name', phoneRaw: phone.phoneRaw, phoneE164: phone.phoneE164 },
  });

  return count === 1;
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
 * Пишет сообщение кандидата в черновик. `false` — повтор апдейта: уникальный индекс
 * (`draft_id`, `candidate_message_id`) отбил вставку (`ON CONFLICT DO NOTHING`), и это исход,
 * а не ошибка.
 */
export const insertChatDraftMessage = async (input: ChatDraftMessageInput): Promise<boolean> => {
  const { count } = await db.candidateDraftMessage.createMany({ data: [input], skipDuplicates: true });

  return count === 1;
};
