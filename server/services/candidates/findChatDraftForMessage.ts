import { type CandidateChatDraftRow, findOpenChatDraftByTelegram } from '#server/repositories/candidateChatDrafts';
import { isProgramTelegram } from '#server/services/candidates/isProgramTelegram';

/**
 * Незаконченный черновик заявки в чате, которому принадлежит сообщение этого Telegram (issue #467).
 * `null` — черновика нет или отправитель стал участником программы или сотрудником, пока черновик
 * висел: сообщение уходит дальше по цепочке, в переписку с кандидатом или приветствие.
 */
export const findChatDraftForMessage = async (telegramUserId: bigint): Promise<CandidateChatDraftRow | null> => {
  const draft = await findOpenChatDraftByTelegram(telegramUserId);

  if (draft === null || (await isProgramTelegram(telegramUserId))) {
    return null;
  }

  return draft;
};
