import { consola } from 'consola';
import type { Message } from 'grammy/types';

import { copyTelegramMessage, TelegramSendError } from '#server/adapters/telegram/outgoing';
import type { CandidateChatApplication } from '#server/repositories/candidateApplications';
import {
  insertCandidateMessage,
  markCandidateMessageUndelivered,
  markEmployeeReplyDelivered,
} from '#server/repositories/candidateMessages';
import type { CandidateMessageContent } from '#server/services/candidates/candidateMessageKind';
import { postTopicNotice } from '#server/services/candidates/postTopicNotice';
import { resolveTopicReplier } from '#server/services/candidates/resolveTopicReplier';
import { cannotWriteText, NOT_EMPLOYEE_TEXT, TELEGRAM_ERROR_TEXT } from '#server/services/candidates/topicTexts';

/**
 * Ответ сотрудника из темы — кандидату копией от имени бота, без подписи сотрудника и без
 * пометки «Переслано» (issue #463, docs/decisions.md → «Переписка с кандидатом»). Кандидату
 * пишет парк, а кто ведёт заявку, видно в админке.
 *
 * Сообщение любого вида уходит как есть — текст, подпись и разметка сотрудника копируются
 * Telegram, бот их не пересобирает.
 *
 * Пишет кандидату только сотрудник (`resolveTopicReplier`). Чужое сообщение в базу не пишется
 * вовсе: это не переписка с кандидатом, а реплика в группе, и бот только объясняет в теме,
 * почему оно не ушло.
 */

const log = consola.withTag('candidates:relay');

export type RelayEmployeeReplyInput = {
  token: string;
  application: CandidateChatApplication;
  message: Message;
  content: CandidateMessageContent;
};

export type RelayEmployeeReplyOutcome = 'not_employee' | 'duplicate' | 'delivered' | 'failed';

export const relayEmployeeReply = async (input: RelayEmployeeReplyInput): Promise<RelayEmployeeReplyOutcome> => {
  const { application, message, content, token } = input;
  const notice = (noticeText: string): Promise<void> =>
    postTopicNotice({ token, application, text: noticeText, replyToMessageId: message.message_id });

  const replier = await resolveTopicReplier(message);

  if (!replier) {
    await notice(NOT_EMPLOYEE_TEXT);

    return 'not_employee';
  }

  const messageId = await insertCandidateMessage({
    applicationId: application.id,
    author: 'employee',
    employeeId: replier.employeeId,
    kind: content.kind,
    text: content.text,
    fileId: content.fileId,
    candidateMessageId: null,
    topicMessageId: message.message_id,
  });

  if (messageId === null) {
    return 'duplicate';
  }

  try {
    const candidateMessageId = await copyTelegramMessage({
      token,
      telegramChatId: application.telegramChatId,
      fromChatId: BigInt(message.chat.id),
      messageId: message.message_id,
    });

    await markEmployeeReplyDelivered({
      messageId,
      candidateMessageId,
      applicationId: application.id,
      employeeId: replier.employeeId,
    });

    return 'delivered';
  } catch (error) {
    if (!(error instanceof TelegramSendError)) {
      // Строка не остаётся `pending` навсегда: исход неизвестен, и админка покажет его отказом.
      await markCandidateMessageUndelivered(messageId, 'failed', 'telegram_error');

      throw error;
    }

    const failure = error.kind === 'invalid_chat' ? 'cannot_write' : 'telegram_error';

    await markCandidateMessageUndelivered(messageId, 'failed', failure);

    log.warn('ответ сотрудника кандидату не отправлен', {
      applicationId: application.id,
      employeeId: replier.employeeId,
      failure: error.kind,
      error: error.message,
    });

    await notice(failure === 'cannot_write' ? cannotWriteText(application.phoneE164) : TELEGRAM_ERROR_TEXT);

    return 'failed';
  }
};
