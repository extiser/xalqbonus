import { Bot, type Transformer } from 'grammy';
import type { Update, UserFromGetMe } from 'grammy/types';

import { registerBotHandlers } from '#server/bot/instance';

/**
 * Бот на двойнике Telegram: настоящие обработчики, настоящий разбор апдейта, отправка
 * никуда не уходящая.
 *
 * Обработчики ставит `registerBotHandlers` — та же функция, что поднимает боевого бота.
 * Собрать их здесь заново значило бы проверять свою копию порядка: порядок и есть то,
 * что тест разводит — приглашение сотрудника против приветствия водителя
 * (server/bot/instance.ts).
 *
 * Сеть подменяется на уровне вызова API, а не `fetch`: `bot.api.config.use` видит метод
 * и тело ровно такими, какими их собрал grammY, и ответ отдаёт тем же путём, каким пришёл бы
 * настоящий. Метод, которого двойник не знает, роняет тест — молча ушедший в никуда вызов
 * хуже упавшего.
 */

/** Отправленное ботом сообщение — то, что в жизни увидел бы человек. */
export type SentMessage = {
  chatId: string;
  text: string;
  messageId: number;
};

/** Удалённое ботом сообщение — прежний экран, который снимает `sendScreen`. */
export type DeletedMessage = {
  chatId: string;
  messageId: number;
};

export type BotDouble = {
  /** Апдейт как от Telegram: тот же путь, что у webhook и long polling. */
  handleUpdate: (update: Update) => Promise<void>;
  /** Всё отправленное, по порядку. */
  sent: SentMessage[];
  /** Всё удалённое, по порядку. */
  deleted: DeletedMessage[];
};

const BOT_INFO: UserFromGetMe = {
  id: 700_000_001,
  is_bot: true,
  first_name: 'XalqBonus Test',
  username: 'xalqbonus_test_bot',
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
  can_manage_bots: false,
  supports_join_request_queries: false,
};

/** Токен формы «цифры:строка». До сети он не доходит, но пустой grammY не принимает. */
const FAKE_TOKEN = '700000001:test-token-goes-nowhere';

const readString = (payload: Record<string, unknown>, field: string): string => {
  const value = payload[field];

  return typeof value === 'string' ? value : String(value);
};

const readNumber = (payload: Record<string, unknown>, field: string): number => {
  const value = payload[field];

  return typeof value === 'number' ? value : Number(value);
};

export const createBotDouble = (): BotDouble => {
  const sent: SentMessage[] = [];
  const deleted: DeletedMessage[] = [];
  // Идентификаторы отправленных сообщений — растущие, как у Telegram: `sendScreen` удаляет
  // прежний экран по тому, что запомнил от предыдущей отправки.
  let lastMessageId = 1_000;

  const respond = (method: string, payload: Record<string, unknown>): unknown => {
    if (method === 'sendMessage') {
      lastMessageId += 1;

      sent.push({
        chatId: readString(payload, 'chat_id'),
        text: readString(payload, 'text'),
        messageId: lastMessageId,
      });

      return { message_id: lastMessageId, date: 0, chat: { id: 0, type: 'private', first_name: '' } };
    }

    if (method === 'deleteMessage') {
      deleted.push({
        chatId: readString(payload, 'chat_id'),
        messageId: readNumber(payload, 'message_id'),
      });

      return true;
    }

    throw new Error(`двойник Telegram не знает метода ${method}`);
  };

  const bot = new Bot(FAKE_TOKEN, { botInfo: BOT_INFO });

  // Приведение одно и неизбежное: `Transformer` обещает ответ, разобранный по имени метода,
  // а двойник отвечает на все методы одной функцией.
  bot.api.config.use(((_previous: unknown, method: string, payload: Record<string, unknown>) =>
    Promise.resolve({ ok: true, result: respond(method, payload) })) as unknown as Transformer);

  registerBotHandlers(bot);

  return {
    handleUpdate: (update: Update) => bot.handleUpdate(update),
    sent,
    deleted,
  };
};

/**
 * Содержимое сообщения — всё, что отличает текст от контакта, фото или голосового.
 * Обязательные поля апдейта — идентификатор, дата, чат и отправитель — собираются здесь
 * и в тесте не повторяются.
 */
export type MessageContent = Omit<
  NonNullable<Update['message']>,
  'message_id' | 'date' | 'chat' | 'from'
>;

let lastUpdateId = 10_000;

/** Сообщение в личном чате: чат у него совпадает с отправителем, как у Telegram. */
export const privateMessageUpdate = (
  telegramUserId: bigint,
  content: MessageContent,
): Update => {
  lastUpdateId += 1;

  return {
    update_id: lastUpdateId,
    message: {
      message_id: lastUpdateId,
      date: Math.floor(Date.now() / 1_000),
      chat: { id: Number(telegramUserId), type: 'private', first_name: 'Азиз' },
      from: {
        id: Number(telegramUserId),
        is_bot: false,
        first_name: 'Азиз',
        last_name: 'Каримов',
        language_code: 'ru',
      },
      ...content,
    },
  };
};

/** Текст команды вместе с разметкой: без неё grammY командой его не считает. */
export const commandContent = (command: string, parameter = ''): MessageContent => {
  const text = parameter === '' ? command : `${command} ${parameter}`;

  return {
    text,
    entities: [{ type: 'bot_command', offset: 0, length: command.length }],
  };
};
