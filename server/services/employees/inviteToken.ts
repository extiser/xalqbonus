import { createHash, randomBytes } from 'node:crypto';

/**
 * Токен приглашения: выпуск, хеш и разбор параметра `/start`.
 *
 * В базе лежит только `sha256` от токена — дамп базы не должен давать готовых приглашений
 * (docs/decisions.md → «Учётка сотрудника и роли»). Соли у хеша нет намеренно: токен —
 * 32 случайных байта, перебирать его словарём нечем, а без соли поиск по хешу остаётся
 * одним индексным запросом вместо перебора всех живых приглашений.
 *
 * Форма параметра — `inv_<токен>`. Префикс нужен, чтобы `/start` отличал приглашение
 * от любых других ссылок запуска, которые появятся позже: разбор по длине строки
 * сломался бы на первой из них.
 */

/** Префикс параметра `/start`. */
export const INVITE_START_PREFIX = 'inv_';

/**
 * Длина токена в байтах. 32 — столько же, сколько у секрета webhook: перебор такого
 * пространства не имеет смысла ни при каком сроке жизни ссылки.
 */
const TOKEN_BYTES = 32;

/**
 * `base64url`, а не hex: параметр `/start` у Telegram ограничен 64 знаками и допускает
 * только латиницу, цифры, дефис и подчёркивание. 32 байта в hex — это 64 знака, и вместе
 * с префиксом `inv_` они в предел уже не влезают.
 */
export const createInviteToken = (): string => randomBytes(TOKEN_BYTES).toString('base64url');

export const hashInviteToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/** Собирает ссылку, которую приглашающий отдаёт человеку. Показывается один раз. */
export const buildInviteLink = (botUsername: string, token: string): string =>
  `https://t.me/${botUsername}?start=${INVITE_START_PREFIX}${token}`;

/**
 * Токен из параметра `/start`. `null` — параметр не про приглашение, и обработчик
 * приглашений в него не лезет.
 */
export const readInviteToken = (startParameter: string): string | null => {
  if (!startParameter.startsWith(INVITE_START_PREFIX)) {
    return null;
  }

  const token = startParameter.slice(INVITE_START_PREFIX.length);

  return token === '' ? null : token;
};
