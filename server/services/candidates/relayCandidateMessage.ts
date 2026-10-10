import { consola } from 'consola';
import type { Message } from 'grammy/types';

import { copyTelegramMessage, TelegramSendError } from '#server/adapters/telegram/outgoing';
import type { CandidateChatApplication } from '#server/repositories/candidateApplications';
import {
  insertCandidateMessage,
  markCandidateMessageDelivered,
  markCandidateMessageUndelivered,
} from '#server/repositories/candidateMessages';
import type { CandidateMessageContent } from '#server/services/candidates/candidateMessageKind';

/**
 * Сообщение кандидата боту — копией в его тему группы сотрудников (issue #463). Ответа
 * в личку нет: кандидат пишет менеджеру, а не боту.
 *
 * Строка пишется до копирования. Отбитая индексом — повтор того же апдейта: Telegram повторяет
 * webhook, не дождавшись ответа, и второй копии в теме быть не должно.
 *
 * Темы нет — сообщение остаётся в базе `no_topic`: в тему, заведённую позже, оно не досылается,
 * а админка заявок покажет его из базы.
 */

const log = consola.withTag('candidates:relay');

export type RelayCandidateMessageInput = {
  token: string;
  application: CandidateChatApplication;
  message: Message;
  content: CandidateMessageContent;
};

export type RelayCandidateMessageOutcome = 'duplicate' | 'no_topic' | 'delivered' | 'failed';

export const relayCandidateMessage = async (
  input: RelayCandidateMessageInput,
): Promise<RelayCandidateMessageOutcome> => {
  const { application, message, content } = input;

  const messageId = await insertCandidateMessage({
    applicationId: application.id,
    author: 'candidate',
    employeeId: null,
    kind: content.kind,
    text: content.text,
    fileId: content.fileId,
    candidateMessageId: message.message_id,
    topicMessageId: null,
  });

  if (messageId === null) {
    return 'duplicate';
  }

  if (application.forumChatId === null || application.forumTopicId === null) {
    await markCandidateMessageUndelivered(messageId, 'failed', 'no_topic');

    log.warn('сообщение кандидата не скопировано: у заявки нет темы', {
      applicationId: application.id,
      kind: content.kind,
    });

    return 'no_topic';
  }

  try {
    const topicMessageId = await copyTelegramMessage({
      token: input.token,
      telegramChatId: application.forumChatId,
      fromChatId: BigInt(message.chat.id),
      messageId: message.message_id,
      messageThreadId: application.forumTopicId,
    });

    await markCandidateMessageDelivered(messageId, { topicMessageId });

    return 'delivered';
  } catch (error) {
    // Отказ любого рода закрывает строку: `pending` навсегда — это сообщение, про которое админка
    // не скажет ничего. Не отказ Telegram уходит наверх и после этого.
    await markCandidateMessageUndelivered(messageId, 'failed', 'telegram_error');

    if (!(error instanceof TelegramSendError)) {
      throw error;
    }

    log.warn('сообщение кандидата не скопировано в тему', {
      applicationId: application.id,
      kind: content.kind,
      failure: error.kind,
      error: error.message,
    });

    return 'failed';
  }
};
