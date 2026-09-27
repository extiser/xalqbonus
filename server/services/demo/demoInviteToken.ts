import { createInviteToken, hashInviteToken } from '#server/services/employees/inviteToken';

/**
 * Токен приглашения в демо (issue #252): тот же, что у приглашения сотрудника, — 32 байта
 * `base64url`, в базе только `sha256`, — со своим префиксом параметра `/start`.
 *
 * Префикс свой, а не общий `inv_`: бот разбирает ссылки по префиксу, и по нему же решает,
 * чей это обработчик. Приглашение в демо принимается сразу, без контакта, и спутать его
 * с приглашением сотрудника значило бы завести учётку тому, кому показывали демо.
 */

export const DEMO_INVITE_START_PREFIX = 'demo_';

export const createDemoInviteToken = createInviteToken;

export const hashDemoInviteToken = hashInviteToken;

/** Ссылка, которую владелец отдаёт зрителю. Показывается один раз. */
export const buildDemoInviteLink = (botUsername: string, token: string): string =>
  `https://t.me/${botUsername}?start=${DEMO_INVITE_START_PREFIX}${token}`;

/** Токен из параметра `/start`. `null` — параметр не про демо. */
export const readDemoInviteToken = (startParameter: string): string | null => {
  if (!startParameter.startsWith(DEMO_INVITE_START_PREFIX)) {
    return null;
  }

  const token = startParameter.slice(DEMO_INVITE_START_PREFIX.length);

  return token === '' ? null : token;
};
