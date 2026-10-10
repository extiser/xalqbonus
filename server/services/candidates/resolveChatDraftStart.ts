import { findOpenChatDraftByTelegram } from '#server/repositories/candidateChatDrafts';
import { readAdPromoCode } from '#server/services/candidates/adLaunch';
import { isProgramTelegram } from '#server/services/candidates/isProgramTelegram';

/**
 * Метка, по которой `/start` ведёт заявку в чате бота (issue #467). `null` — `/start` не про заявку,
 * и он уходит в обычное приветствие.
 *
 * Метка — реклама в Telegram с любым входом: вход решает только ссылку (docs/decisions.md →
 * «Заявка в чате бота»). `/start` без параметра посреди незаконченного черновика начинает его
 * заново по метке черновика. Участник программы и сотрудник заявку не подают — им приветствие.
 */
export const resolveChatDraftStart = async (telegramUserId: bigint, parameter: string): Promise<string | null> => {
  const promoCode =
    parameter === ''
      ? ((await findOpenChatDraftByTelegram(telegramUserId))?.promoCode ?? null)
      : await readAdPromoCode(parameter);

  if (promoCode === null || (await isProgramTelegram(telegramUserId))) {
    return null;
  }

  return promoCode;
};
