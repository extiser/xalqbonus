import { consola } from 'consola';
import { deleteTelegramMessage, TelegramSendError } from '#server/adapters/telegram/outgoing';
import { readBotToken } from '#server/bot/config';
import {
  findMailingRecallTarget,
  markRecipientRecalled,
} from '#server/repositories/mailings';

/**
 * Отзыв у одного адресата — то, что делает одно задание отзыва в очереди `mailing`.
 *
 * Не удалось — адресат остаётся не отозванным, и причина не выясняется: удалил ли человек
 * переписку сам, истекли ли 48 часов, заблокировал ли бота — на экране это одно
 * «отозвано N из M» (issue #150). Поэтому отказ Telegram по содержанию закрывает задание
 * без повтора, а не роняет его.
 *
 * Исход отправки не трогается: `outcome` остаётся `sent`, снятие видно по `recalled_at`.
 *
 * Уже снятого адресата повторное задание пропускает по заполненному `recalled_at`
 * и второго запроса на удаление не шлёт.
 */
const log = consola.withTag('mailings:recall');

/**
 * Чем кончилось задание.
 *
 * - `recalled` — сообщение удалено, отметка записана
 * - `not_recalled` — Telegram не удалил или удалять нечем; причина не хранится
 * - `already_recalled` — снято раньше, запроса не было
 * - `not_recallable` — рассылки или адресата нет, сообщение ему не дошло или отзыв
 *   не запускали: такое задание ставить некому
 */
export type MailingRecallOutcome = 'recalled' | 'not_recalled' | 'already_recalled' | 'not_recallable';

export type RecallMailingMessageInput = {
  mailingId: string;
  personId: string;
  /** Последняя ли попытка: на ней сбой сети закрывает задание, а не ждёт повтора. */
  lastAttempt: boolean;
};

export const recallMailingMessage = async (
  input: RecallMailingMessageInput,
): Promise<MailingRecallOutcome> => {
  const { mailingId, personId } = input;
  const row = await findMailingRecallTarget(mailingId, personId);

  if (!row || row.recallStartedAt === null || row.outcome !== 'sent' || row.messageId === null) {
    log.warn('задание отзыва без отправленного сообщения', { mailingId, personId });

    return 'not_recallable';
  }

  if (row.recalledAt !== null) {
    return 'already_recalled';
  }

  if (row.telegramChatId === null) {
    log.info('отзыв: не нашлось привязки, через которую ушло сообщение', { mailingId, personId });

    return 'not_recalled';
  }

  const token = readBotToken();

  // Пустой токен — авария окружения, как у отправки: повтор без перезапуска ничего не изменит.
  if (token === '') {
    log.error('отзыв не выполнен: TG_BOT_TOKEN пуст, удалять нечем', { mailingId });

    return 'not_recalled';
  }

  const chatId = row.telegramChatId.toString();

  try {
    await deleteTelegramMessage({
      token,
      telegramChatId: row.telegramChatId,
      messageId: Number(row.messageId),
    });
  } catch (error) {
    if (!(error instanceof TelegramSendError)) {
      throw error;
    }

    // Лимит повторяется всегда — у него своя очередь ожидания, и попытки он не тратит.
    if (error.kind === 'rate_limit') {
      throw error;
    }

    if (error.kind === 'transient' && !input.lastAttempt) {
      log.warn('отзыв: Telegram недоступен, задание повторится', { mailingId, chatId, reason: error.message });

      throw error;
    }

    log.info('отзыв: сообщение не удалено', { mailingId, chatId, kind: error.kind, reason: error.message });

    return 'not_recalled';
  }

  if (!(await markRecipientRecalled(mailingId, personId))) {
    return 'already_recalled';
  }

  return 'recalled';
};
