import { consola } from 'consola';
import type { Context } from 'grammy';

import { recallLastScreen, rememberLastScreen } from '#server/bot/state';

/**
 * Экран бота: единственная отправка сообщения в чат водителя.
 *
 * В переписке живёт один экран бота. Отправляя новый, бот удаляет свой предыдущий —
 * иначе кнопки прошлых шагов остаются в истории живыми и нажимаются, а водители парка
 * жмут в то, что видят. Три подряд `/start` обязаны оставить одно приветствие, а не три.
 *
 * Правило относится к экранам диалога — выбор языка, запрос телефона, ожидание проверки,
 * исходы привязки, главное меню. Уведомления экранами диалога не являются и через эту
 * функцию не идут.
 *
 * Редактированием одного сообщения это не делается: клавиатура запроса контакта ставится
 * только отправкой, при `editMessageText` её нет вовсе, то есть шаг с телефоном таким
 * способом не покрывается — а разные механики на соседних экранах хуже одной.
 *
 * Сообщения водителя не трогаются: в приватном чате бот их удалять не может, и присланный
 * контакт остаётся в переписке.
 */

const log = consola.withTag('bot:screen');

/** Оформление сообщения — ровно то, что принимает `context.reply`, без своего словаря поверх. */
type ScreenOptions = Parameters<Context['reply']>[1];

/**
 * Отправляет экран и убирает прежний.
 *
 * Порядок именно такой: сначала отправка, потом удаление. Удаление — то, что может не
 * получиться: сообщение мог удалить сам человек, а спустя 48 часов Telegram не даёт удалить
 * и своё. Делать его первым значило бы ставить новый экран в зависимость от чужого отказа,
 * поэтому неудача удаления обработчик не роняет и водителю продолжить не мешает —
 * она уходит строкой в лог.
 */
export const sendScreen = async (
  context: Context,
  telegramChatId: bigint,
  messageText: string,
  options?: ScreenOptions,
): Promise<void> => {
  const previousMessageId = recallLastScreen(telegramChatId);
  const message = await context.reply(messageText, options);

  rememberLastScreen(telegramChatId, message.message_id);

  if (previousMessageId === null) {
    return;
  }

  try {
    // Числом, а не bigint: id чата у Telegram укладывается в безопасное целое JS,
    // и сюда он приехал числом же — из `context.chat.id`.
    await context.api.deleteMessage(Number(telegramChatId), previousMessageId);
  } catch (error) {
    // Телефона в строке нет и быть не должно: причина отказа и то, где он случился,
    // отвечают на вопрос целиком.
    log.warn('прошлый экран не удалился', {
      chatId: telegramChatId.toString(),
      messageId: previousMessageId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
