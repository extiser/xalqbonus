import { text } from '#server/bot/texts';
import type { Language } from '#server/generated/prisma/enums';
import { findOpenApplicationByTelegram } from '#server/repositories/candidateApplications';
import { closeChatDraft, findOpenChatDraftByTelegram, upsertOpenChatDraft } from '#server/repositories/candidateChatDrafts';
import {
  type ChatDraftReply,
  REMOVE_KEYBOARD,
  repeatText,
  sendPhoneKeyboard,
} from '#server/services/candidates/chatDraftReplies';
import { WELCOME_BONUS_POINTS, WELCOME_TRIPS_REQUIRED } from '#server/services/points/awardWelcomeBonus';

/**
 * `/start` по метке рекламы в чате бота (issue #467): начало заявки в чате или «заявка уже
 * отправлена». Кто пришёл и по какой метке, уже решил обработчик (`resolveChatDraftStart`);
 * здесь — что ответить. Идёт внутри очереди чата: шаг черновика читают и пишут только там.
 */

export type StartChatDraftInput = {
  telegramUserId: bigint;
  telegramChatId: bigint;
  /** Имя и фамилия из Telegram через пробел. */
  telegramName: string;
  telegramUsername: string | null;
  promoCode: string;
  /** По языку Telegram — язык нового черновика. */
  language: Language;
  now: Date;
  reply: ChatDraftReply;
};

export type StartChatDraftOutcome = 'repeat' | 'started';

export const startChatDraft = async (input: StartChatDraftInput): Promise<StartChatDraftOutcome> => {
  const open = await findOpenApplicationByTelegram(input.telegramUserId);

  if (open) {
    // Незаконченный черновик рядом с открытой заявкой — заявку подали в Mini App посреди диалога.
    // Черновик кончается ею: иначе следующие сообщения кандидата шли бы в черновик, а не в тему.
    const draft = await findOpenChatDraftByTelegram(input.telegramUserId);

    if (draft) {
      await closeChatDraft(draft.id, open.id);
    }

    await input.reply(repeatText(open, open.language, input.now), REMOVE_KEYBOARD);

    return 'repeat';
  }

  const draft = await upsertOpenChatDraft({
    telegramUserId: input.telegramUserId,
    telegramChatId: input.telegramChatId,
    telegramName: input.telegramName,
    telegramUsername: input.telegramUsername,
    promoCode: input.promoCode,
    language: input.language,
    startedAt: input.now,
  });

  await input.reply(
    text('application_chat_intro', draft.language, {
      trips: String(WELCOME_TRIPS_REQUIRED),
      points: String(WELCOME_BONUS_POINTS),
    }),
    sendPhoneKeyboard(draft.language),
  );

  return 'started';
};
