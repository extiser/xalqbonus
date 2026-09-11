import { consola } from 'consola';
import { sendTelegramMessage, TelegramSendError } from '#server/adapters/telegram/outgoing';
import { renderNotification, type Notification } from '#server/bot/notifications';
import { readBotToken } from '#server/bot/config';
import { closeTelegramLink, findNotificationRecipient } from '#server/repositories/programMembership';

/**
 * Отправка одного уведомления одному человеку.
 *
 * Всё, что зависит от человека, читается здесь, в момент отправки: и канал связи, и язык,
 * и выключатель уведомлений. Между постановкой задания и его исполнением проходит время —
 * очередь могла стоять под лимитом, задание могло повторяться, — и за это время человек
 * успевает и выключить уведомления, и сменить язык, и потерять привязку.
 *
 * Отказ Telegram сюда доезжает уже разобранным (server/adapters/telegram/outgoing.ts).
 * Умерший канал закрывается здесь, потому что это решение про нашу базу; что делать
 * с лимитом и сбоем — решает очередь, и такие отказы уходят наверх как есть.
 */

const log = consola.withTag('notifications');

/**
 * Чем кончилось задание. Все исходы штатные: ни один из них не отказ.
 *
 * - `sent` — сообщение ушло
 * - `no_recipient` — активной привязки нет, писать некуда
 * - `notifications_disabled` — человек уведомления выключил
 * - `chat_closed` — Telegram сказал, что канал умер, и привязка закрыта
 * - `bot_disabled` — на машине нет токена, бота нет вовсе
 */
export type NotificationOutcome =
  | 'sent'
  | 'no_recipient'
  | 'notifications_disabled'
  | 'chat_closed'
  | 'bot_disabled';

export type SendNotificationInput = { personId: string } & Notification;

export const sendNotification = async (
  input: SendNotificationInput,
): Promise<NotificationOutcome> => {
  const { personId, template } = input;
  const token = readBotToken();

  // Пустой токен — рабочее состояние машины, на которую задача выкатывается раньше, чем
  // на ней появляется бот (server/bot/config.ts). Падать заданию из-за этого не за чем:
  // отправлять всё равно нечем, а повторы упирались бы в то же самое.
  if (token === '') {
    log.warn('уведомление не отправлено: бот выключен, токена нет', { template });

    return 'bot_disabled';
  }

  const recipient = await findNotificationRecipient(personId);

  // Человек вне программы: привязки нет или её закрыли. Это не отказ — писать ему некуда,
  // и задание на этом кончается.
  if (recipient === null) {
    log.info('уведомление не отправлено: активной привязки нет', { template, personId });

    return 'no_recipient';
  }

  const chatId = recipient.telegramChatId.toString();

  if (!recipient.notificationsEnabled) {
    log.info('уведомление не отправлено: уведомления выключены', { template, chatId });

    return 'notifications_disabled';
  }

  try {
    await sendTelegramMessage({
      token,
      telegramChatId: recipient.telegramChatId,
      text: renderNotification(input, recipient.language),
    });
  } catch (error) {
    // Единственное, что мы узнаём о смерти канала связи: водитель, заблокировавший бота,
    // об этом не сообщит, и до следующего `/start` привязка иначе осталась бы активной,
    // а каждое уведомление — уходить в пустоту.
    if (error instanceof TelegramSendError && error.kind === 'invalid_chat') {
      const closed = await closeTelegramLink(recipient.linkId, 'invalid_chat', new Date());

      log.warn('канал связи умер, привязка закрыта', {
        template,
        chatId,
        closed,
        reason: error.message,
      });

      return 'chat_closed';
    }

    // Отказ, с которым решает что делать очередь, — лимит, сбой Telegram, неверный запрос.
    // Строка пишется здесь, потому что здесь ещё известен чат: наверх едет один отказ.
    log.warn('уведомление не ушло', {
      template,
      chatId,
      kind: error instanceof TelegramSendError ? error.kind : 'unknown',
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }

  // Телефона и текста сообщения в строке нет и быть не должно: чат, шаблон и исход
  // отвечают на вопрос «дошло ли» целиком.
  log.info('уведомление отправлено', { template, chatId, language: recipient.language });

  return 'sent';
};
