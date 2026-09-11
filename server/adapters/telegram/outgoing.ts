import { Api, GrammyError, HttpError } from 'grammy';

/**
 * Исходящие вызовы Bot API — и только они.
 *
 * Здесь `Api`, а не `Bot`. Второй экземпляр бота с тем же токеном поднимать нельзя ни при
 * каких условиях: у токена Telegram ровно один приёмник апдейтов, и `bot.start()` в воркере
 * забрал бы апдейты у приложения молча, без ошибки (docs/decisions.md → «Тестовых ботов
 * два»). `Api` апдейтов не спрашивает вовсе — он умеет только звать методы.
 *
 * Адаптер про базу не знает ничего: ему дают токен, чат и готовый текст. Что делать
 * с отказом — решает сервис, а классификация отказа живёт здесь, потому что это знание
 * о Telegram, а не о нас.
 */

/**
 * Вид отказа. Определяет, что делать дальше, и ничего кроме.
 *
 * - `rate_limit` — превышен лимит, Telegram сказал, через сколько повторить
 * - `invalid_chat` — канал связи умер: бота заблокировали, удалили или чат не существует
 * - `rejected` — запрос неверен сам по себе, повтор ничего не изменит
 * - `transient` — сеть или сбой на стороне Telegram, повтор осмыслен
 */
export type TelegramSendFailureKind = 'rate_limit' | 'invalid_chat' | 'rejected' | 'transient';

export class TelegramSendError extends Error {
  readonly kind: TelegramSendFailureKind;
  /** Сколько ждать до повтора. Заполнен только у `rate_limit`. */
  readonly retryAfterMs: number | null;

  constructor(kind: TelegramSendFailureKind, message: string, retryAfterMs: number | null = null) {
    super(message);
    this.name = 'TelegramSendError';
    this.kind = kind;
    this.retryAfterMs = retryAfterMs;
  }
}

// Экземпляр один на процесс и держится на globalThis — по той же причине, что соединение
// с очередью и сам бот: горячая перезагрузка в dev перевычисляет модуль, а держать два
// клиента к одному токену незачем.
const globalForApi = globalThis as typeof globalThis & { outgoingTelegramApi?: Api };

const getApi = (token: string): Api => {
  if (!globalForApi.outgoingTelegramApi) {
    globalForApi.outgoingTelegramApi = new Api(token);
  }

  return globalForApi.outgoingTelegramApi;
};

/**
 * «Чат не найден» приезжает не кодом, а описанием: 400 у Bot API — это и неверная разметка,
 * и несуществующий чат, и десяток других вещей. Различать их можно только по тексту.
 */
const INVALID_CHAT_DESCRIPTIONS = ['chat not found', 'user is deactivated', 'peer_id_invalid'];

const isInvalidChat = (error: GrammyError): boolean => {
  const description = error.description.toLowerCase();

  return INVALID_CHAT_DESCRIPTIONS.some((known) => description.includes(known));
};

/**
 * Отказ Bot API — в вид отказа.
 *
 * `403` — это всегда умерший канал: бота заблокировали, выгнали или удалили учётную запись.
 * Другого смысла у запрета на отправку в приватный чат нет.
 */
const classify = (error: GrammyError): TelegramSendError => {
  if (error.error_code === 429) {
    // `retry_after` приходит в секундах. Секунды на месте не всегда — тогда берём одну:
    // повтор через секунду не хуже повтора без задержки, а лимит очереди снимет остальное.
    const retryAfterSeconds = error.parameters.retry_after ?? 1;

    return new TelegramSendError(
      'rate_limit',
      `Telegram отбил по лимиту: ${error.description}`,
      retryAfterSeconds * 1_000,
    );
  }

  if (error.error_code === 403 || isInvalidChat(error)) {
    return new TelegramSendError('invalid_chat', error.description);
  }

  if (error.error_code >= 500) {
    return new TelegramSendError('transient', `Telegram ответил ошибкой: ${error.description}`);
  }

  return new TelegramSendError('rejected', `Telegram отклонил запрос: ${error.description}`);
};

export type SendMessageInput = {
  token: string;
  telegramChatId: bigint;
  text: string;
};

/**
 * Шлёт сообщение в чат. Успех — возврат без значения, отказ — `TelegramSendError`.
 *
 * Идентификатор чата строкой: метод принимает его и числом, и строкой, а строка
 * не требует предположений о том, что id чата укладывается в безопасное целое JS
 * (server/bot/screen.ts).
 *
 * `parse_mode: HTML` — как у экранов диалога: подстановки в текст экранируются сборщиком
 * текста, и разные режимы разметки на соседних сообщениях одного бота были бы ловушкой.
 */
export const sendTelegramMessage = async (input: SendMessageInput): Promise<void> => {
  try {
    await getApi(input.token).sendMessage(input.telegramChatId.toString(), input.text, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  } catch (error) {
    if (error instanceof GrammyError) {
      throw classify(error);
    }

    // До Telegram не доехали вовсе: оборванная сеть, таймаут, отказ DNS. Повтор осмыслен.
    if (error instanceof HttpError) {
      throw new TelegramSendError('transient', `Telegram недоступен: ${error.message}`);
    }

    throw error;
  }
};
