/**
 * Промо-метки (issue #377): плакат, листовка, QR в офисе — ссылка в бота с параметром
 * `/start p_<код>`.
 *
 * Лежит в `shared/`: ссылку будет собирать раздел «Промо» в вебе, а разбирает её бот, и правило
 * годного кода у них одно.
 */

/**
 * Префикс параметра `/start` промо-метки. Свой, а не `demo_` и не `emp_`: бот разбирает ссылки
 * по префиксу и по нему же решает, чей это обработчик.
 */
export const PROMO_START_PREFIX = 'p_';

/** Предел Telegram для параметра `start`. */
const START_PARAMETER_MAX_LENGTH = 64;

/** Остаток после префикса: от одного символа алфавита base64url — его Telegram и пропускает в `start`. */
const PROMO_CODE_REST_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Код метки из параметра `/start` — целиком, с префиксом: `p_poster1`. `null` — параметр
 * не про промо-метку или негоден.
 */
export const readPromoCode = (startParameter: string): string | null => {
  if (
    !startParameter.startsWith(PROMO_START_PREFIX) ||
    startParameter.length > START_PARAMETER_MAX_LENGTH
  ) {
    return null;
  }

  const rest = startParameter.slice(PROMO_START_PREFIX.length);

  return PROMO_CODE_REST_PATTERN.test(rest) ? startParameter : null;
};
