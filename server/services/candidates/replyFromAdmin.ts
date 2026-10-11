import { consola } from 'consola';

import { sendTelegramMessage, SKIPPED_MESSAGE_ID, TelegramSendError } from '#server/adapters/telegram/outgoing';
import { readBotToken } from '#server/bot/config';
import { enqueueScreen } from '#server/bot/state';
import type { CandidateMessageDelivery } from '#server/generated/prisma/enums';
import { findChatApplicationById } from '#server/repositories/candidateApplications';
import {
  insertCandidateMessage,
  markCandidateMessageDelivered,
  markCandidateMessageUndelivered,
  markEmployeeReplyDelivered,
} from '#server/repositories/candidateMessages';
import { ApplicationDenialError } from '#server/services/candidates/applicationDenial';
import { CANDIDATE_REPLY_MAX_LENGTH } from '#shared/candidateApplications';
import { escapeHtml } from '#shared/telegramHtml';

/**
 * Ответ кандидату из админки (issue #471, docs/decisions.md → «Заявки в админке»): владелец
 * или админ пишет в карточке заявки, кандидату сообщение уходит от имени парка без подписи —
 * как ответ из темы, — а в тему ложится копия с именем автора: менеджеры видят весь разговор.
 *
 * Строка переписки пишется `pending` до отправки и закрывается исходом после неё. Доставленный
 * ответ — ответ сотрудника: «Новая» уходит «В работу», и пустой «ведёт» получает автора, одной
 * транзакцией с исходом (`markEmployeeReplyDelivered`).
 *
 * Отправки по заявке идут цепочкой чата кандидата (`enqueueScreen`), как у пересылки из темы:
 * приложение и бот — один процесс, и ответ из админки не обгонит соседнюю пересылку.
 */

const log = consola.withTag('candidates:admin-reply');

/** Текст ответа, обрезанный по краям. `null` — пустой или длиннее предела Telegram. */
export const readCandidateReply = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;

  const text = value.trim();

  return text.length >= 1 && text.length <= CANDIDATE_REPLY_MAX_LENGTH ? text : null;
};

export type ReplyFromAdminInput = {
  applicationId: string;
  employeeId: string;
  employeeName: string;
  text: string;
};

export const replyFromAdmin = async (input: ReplyFromAdminInput): Promise<{ delivery: CandidateMessageDelivery }> => {
  const application = await findChatApplicationById(input.applicationId);

  if (!application) {
    throw new ApplicationDenialError('application_not_found');
  }

  if (!application.writeAllowed) {
    throw new ApplicationDenialError('cannot_write');
  }

  const messageId = await insertCandidateMessage({
    applicationId: application.id,
    author: 'employee',
    employeeId: input.employeeId,
    kind: 'text',
    text: input.text,
    fileId: null,
    candidateMessageId: null,
    topicMessageId: null,
  });

  if (messageId === null) {
    // Номера сообщения в теме у ответа из админки нет, и индекс повтора апдейта его не отбивает.
    throw new Error('строка ответа из админки не записалась');
  }

  const token = readBotToken();

  try {
    const candidateMessageId = await enqueueScreen(application.telegramChatId, () =>
      sendTelegramMessage({ token, telegramChatId: application.telegramChatId, text: escapeHtml(input.text) }),
    );

    await markEmployeeReplyDelivered({
      messageId,
      candidateMessageId,
      applicationId: application.id,
      employeeId: input.employeeId,
    });
  } catch (error) {
    if (!(error instanceof TelegramSendError)) {
      // Строка не остаётся `pending` навсегда: исход неизвестен, и админка покажет его отказом.
      await markCandidateMessageUndelivered(messageId, 'failed', 'telegram_error');

      throw error;
    }

    const cannotWrite = error.kind === 'invalid_chat';

    await markCandidateMessageUndelivered(messageId, 'failed', cannotWrite ? 'cannot_write' : 'telegram_error');

    log.warn('ответ из админки кандидату не отправлен', {
      applicationId: application.id,
      employeeId: input.employeeId,
      failure: error.kind,
      error: error.message,
    });

    throw new ApplicationDenialError(cannotWrite ? 'cannot_write' : 'telegram_error');
  }

  if (application.forumChatId !== null && application.forumTopicId !== null) {
    const forumChatId = application.forumChatId;
    const forumTopicId = application.forumTopicId;

    try {
      const topicMessageId = await enqueueScreen(application.telegramChatId, () =>
        sendTelegramMessage({
          token,
          telegramChatId: forumChatId,
          messageThreadId: forumTopicId,
          text: `<b>${escapeHtml(input.employeeName)} из админки:</b>\n${escapeHtml(input.text)}`,
        }),
      );

      // Заглушённая вне прода отправка номера не даёт: ноль в строке спутал бы индекс повтора.
      if (topicMessageId !== SKIPPED_MESSAGE_ID) {
        await markCandidateMessageDelivered(messageId, { topicMessageId });
      }
    } catch (error) {
      // Кандидату ответ уже доставлен: копия в теме — для сотрудников, и её отказ ответ не отменяет.
      log.warn('копия ответа из админки в тему не отправлена', {
        applicationId: application.id,
        kind: error instanceof TelegramSendError ? error.kind : 'unknown',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { delivery: 'delivered' };
};
