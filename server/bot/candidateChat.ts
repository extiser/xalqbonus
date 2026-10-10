import { consola } from 'consola';
import type { Bot } from 'grammy';

import { readBotToken, readCandidatesChatId } from '#server/bot/config';
import { enqueueScreen } from '#server/bot/state';
import { readCandidateMessageKind } from '#server/services/candidates/candidateMessageKind';
import { findCandidateChatApplication } from '#server/services/candidates/findCandidateChatApplication';
import { findTopicApplication } from '#server/services/candidates/findTopicApplication';
import { relayCandidateMessage } from '#server/services/candidates/relayCandidateMessage';
import { relayEmployeeReply } from '#server/services/candidates/relayEmployeeReply';

/**
 * Переписка с кандидатом через группу сотрудников с темами (issue #463, docs/decisions.md →
 * «Переписка с кандидатом»).
 *
 * Два направления:
 *
 * - кандидат пишет боту в личку — бот копирует сообщение в тему его заявки, ответа в личку нет;
 * - сотрудник пишет в теме — бот отправляет это кандидату копией от своего имени, без подписи
 *   сотрудника: кандидату пишет парк, а кто ведёт заявку, видно в админке.
 *
 * Всё, что не про кандидата, уступается дальше (`next()`): команды — `/start` кандидата получает
 * обычное приветствие с кнопкой, — сообщения участников программы, сотрудников и тех, у кого
 * заявок нет, а в группах — всё, кроме тем группы кандидатов.
 *
 * Отправки по одной заявке идут по очереди — цепочкой чата кандидата (server/bot/state.ts →
 * `enqueueScreen`) в обе стороны: в режиме webhook каждый апдейт приходит отдельным запросом,
 * и два быстрых сообщения иначе ложились бы в тему в обратном порядке.
 */

const log = consola.withTag('bot:candidates');

/** Команда — текст с косой черты: её разбирают обработчики дальше по цепочке. */
const isCommand = (messageText: string | undefined): boolean => messageText?.startsWith('/') ?? false;

export const registerCandidateChatHandlers = (bot: Bot): void => {
  bot.chatType('private').on('message', async (context, next) => {
    const { message } = context;

    if (isCommand(message.text)) {
      await next();

      return;
    }

    const application = await findCandidateChatApplication(BigInt(message.from.id));
    const content = application === null ? null : readCandidateMessageKind(message);

    if (application === null || content === null) {
      await next();

      return;
    }

    const outcome = await enqueueScreen(application.telegramChatId, () =>
      relayCandidateMessage({ token: readBotToken(), application, message, content }),
    );

    log.info('сообщение кандидата', { applicationId: application.id, kind: content.kind, outcome });
  });

  bot.on('message', async (context, next) => {
    const { message } = context;
    const candidatesChatId = readCandidatesChatId();

    // Чужие группы и личка — не сюда. Сообщение в «General» группы кандидатов — тоже:
    // темы заявки у него нет.
    //
    // Бот отсекается только без `sender_chat`: анонимный администратор пишет от служебного бота
    // Telegram с заполненным `sender_chat`, и молча пропущенный ответ он счёл бы ушедшим.
    // Такое сообщение идёт дальше и получает объяснение (`resolveTopicReplier`).
    if (
      candidatesChatId === null ||
      BigInt(message.chat.id) !== candidatesChatId ||
      message.is_topic_message !== true ||
      message.message_thread_id === undefined ||
      (message.from.is_bot && message.sender_chat === undefined)
    ) {
      await next();

      return;
    }

    const content = readCandidateMessageKind(message);

    if (content === null) {
      await next();

      return;
    }

    const application = await findTopicApplication(candidatesChatId, message.message_thread_id);

    if (!application) {
      log.info('сообщение в теме без заявки', { topicId: message.message_thread_id });

      await next();

      return;
    }

    const outcome = await enqueueScreen(application.telegramChatId, () =>
      relayEmployeeReply({ token: readBotToken(), application, message, content }),
    );

    log.info('ответ из темы кандидату', { applicationId: application.id, kind: content.kind, outcome });
  });
};
