/**
 * Ссылки сотрудника (issue #267): страница приглашения, страница «задать пароль» и ссылка
 * привязки Telegram на бота.
 *
 * Приглашение и пароль ведут на страницы веба на том же хосте, что приложение: пароль
 * задаётся только в вебе, и бот для них не нужен. Хост приходит аргументом — его знает
 * запрос, а не сервис (`server/utils/appOrigin.ts`).
 *
 * Привязка Telegram ведёт в бота: `telegram_user_id` приходит только подписанным апдейтом,
 * руками он не вводится нигде.
 */

/** Страница приглашения: принять и задать пароль. */
export const buildInvitePageLink = (appOrigin: string, token: string): string =>
  `${appOrigin}/invite/${token}`;

/** Страница «задать пароль» после сброса. */
export const buildSetPasswordLink = (appOrigin: string, token: string): string =>
  `${appOrigin}/set-password/${token}`;

/**
 * Префикс параметра `/start` ссылки привязки. Свой, а не `inv_` и не `demo_`: бот разбирает
 * ссылки по префиксу и по нему же решает, чей это обработчик.
 */
export const TELEGRAM_BIND_START_PREFIX = 'emp_';

/** Ссылка привязки Telegram — в бота, с токеном в параметре `/start`. */
export const buildTelegramBindLink = (botUsername: string, token: string): string =>
  `https://t.me/${botUsername}?start=${TELEGRAM_BIND_START_PREFIX}${token}`;

/** Токен из параметра `/start`. `null` — параметр не про привязку сотрудника. */
export const readTelegramBindToken = (startParameter: string): string | null => {
  if (!startParameter.startsWith(TELEGRAM_BIND_START_PREFIX)) {
    return null;
  }

  const token = startParameter.slice(TELEGRAM_BIND_START_PREFIX.length);

  return token === '' ? null : token;
};
