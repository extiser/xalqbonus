import { consola } from 'consola';

import { sendTelegramMessage, SKIPPED_MESSAGE_ID, TelegramSendError } from '#server/adapters/telegram/outgoing';
import { readBotToken } from '#server/bot/config';
import { enqueueScreen } from '#server/bot/state';
import type { CandidateMessageDelivery } from '#server/generated/prisma/enums';
import {
  findDraftForReply,
  insertDraftReply,
  markDraftReplyDelivered,
  markDraftReplyFailed,
} from '#server/repositories/candidateChatDrafts';
import { ApplicationDenialError } from '#server/services/candidates/applicationDenial';
import { escapeHtml } from '#shared/telegramHtml';

/**
 * Ответ из админки человеку из «Не закончили» (issue #475, docs/decisions.md → «„Не закончили“
 * в заявках»): владелец или админ пишет в карточке, человеку сообщение уходит от имени парка без
 * подписи, как ответ на заявку. Темы в группе у него нет — копии нет никуда.
 *
 * Строка пишется `pending` до отправки и закрывается исходом после неё. Доставленный ответ ставит
 * автора ведущим, если ведущего ещё нет. Шаг черновика ответ не двигает: если человек ответит
 * текстом на шаге имени, текст станет именем и подаст заявку — так решено.
 *
 * Всё — проверка черновика, строка и отправка — идёт в очереди чата человека (`enqueueScreen`):
 * в ней же черновик двигают его сообщения, и ответ не запишется в черновик, который в той же
 * очереди только что закончился заявкой.
 */

const log = consola.withTag('candidates:draft-reply');

export type ReplyToDraftInput = {
  draftId: string;
  employeeId: string;
  text: string;
};

export const replyToDraft = async (input: ReplyToDraftInput): Promise<{ delivery: CandidateMessageDelivery }> => {
  const found = await findDraftForReply(input.draftId);

  if (!found) {
    throw new ApplicationDenialError('draft_not_found');
  }

  const token = readBotToken();

  return enqueueScreen(found.telegramChatId, async () => {
    const draft = await findDraftForReply(input.draftId);

    if (!draft) {
      throw new ApplicationDenialError('draft_not_found');
    }

    if (draft.applicationId !== null) {
      throw new ApplicationDenialError('draft_closed');
    }

    const messageId = await insertDraftReply({ draftId: draft.id, employeeId: input.employeeId, text: input.text });

    let sentMessageId: number;

    try {
      sentMessageId = await sendTelegramMessage({
        token,
        telegramChatId: draft.telegramChatId,
        text: escapeHtml(input.text),
      });
    } catch (error) {
      if (!(error instanceof TelegramSendError)) {
        // Строка не остаётся `pending` навсегда: исход неизвестен, и админка покажет его отказом.
        await markDraftReplyFailed(messageId, 'telegram_error');

        throw error;
      }

      const cannotWrite = error.kind === 'invalid_chat';

      await markDraftReplyFailed(messageId, cannotWrite ? 'cannot_write' : 'telegram_error');

      log.warn('ответ из админки человеку из «Не закончили» не отправлен', {
        draftId: draft.id,
        employeeId: input.employeeId,
        failure: error.kind,
        error: error.message,
      });

      throw new ApplicationDenialError(cannotWrite ? 'cannot_write' : 'telegram_error');
    }

    await markDraftReplyDelivered({
      messageId,
      // Заглушённая вне прода отправка номера не даёт: ноль в строке спутал бы индекс повтора.
      candidateMessageId: sentMessageId === SKIPPED_MESSAGE_ID ? null : sentMessageId,
      draftId: draft.id,
      employeeId: input.employeeId,
    });

    return { delivery: 'delivered' as const };
  });
};
