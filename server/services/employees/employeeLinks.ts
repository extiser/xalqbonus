import type { PromoEntry } from '#server/generated/prisma/enums';

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

/**
 * Ссылка промо-метки (issue #380) — в того же бота, с кодом метки в параметре: код уже
 * с префиксом `p_` (`shared/promoLinks.ts`). Здесь, рядом с привязкой, а не у раздела «Промо»:
 * ссылки на бота собираются в одном месте и из одного имени бота.
 *
 * Куда ведёт, решает вход метки, а не носитель (issue #467). Вход в приложение — сразу в Mini App:
 * `?startapp=` открывает главное приложение бота и кладёт код в `start_param` подписанной
 * `initData`. Работает это, только если главное приложение задано боту в BotFather. Вход в чат
 * бота — `/start <код>`.
 */
export const buildPromoLink = (botUsername: string, code: string, entry: PromoEntry): string =>
  entry === 'miniapp' ? buildPromoAppLink(botUsername, code) : buildPromoBotLink(botUsername, code);

/** Ссылка метки в чат бота — `?start=<код>`. */
export const buildPromoBotLink = (botUsername: string, code: string): string =>
  `https://t.me/${botUsername}?start=${code}`;

/** Ссылка метки в Mini App — `?startapp=<код>`. */
export const buildPromoAppLink = (botUsername: string, code: string): string =>
  `https://t.me/${botUsername}?startapp=${code}`;

/** Чат с ботом — «Написать менеджеру» у заявки кандидата (issue #456): переписка идёт через бота. */
export const buildBotChatLink = (botUsername: string): string => `https://t.me/${botUsername}`;

/** Токен из параметра `/start`. `null` — параметр не про привязку сотрудника. */
export const readTelegramBindToken = (startParameter: string): string | null => {
  if (!startParameter.startsWith(TELEGRAM_BIND_START_PREFIX)) {
    return null;
  }

  const token = startParameter.slice(TELEGRAM_BIND_START_PREFIX.length);

  return token === '' ? null : token;
};
