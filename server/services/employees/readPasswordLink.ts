import { findAccessLinkByTokenHash } from '#server/repositories/employeeAccessLinks';
import { accessLinkState, type DeadAccessLinkOutcome } from '#server/services/employees/accessLinkState';
import { hashInviteToken } from '#server/services/employees/inviteToken';

/**
 * Ссылка «задать пароль» по токену из адреса страницы (issue #267): у живой — имя и телефон
 * учётки, иначе — чем она кончилась.
 *
 * Без входа: пароль сброшен, и войти человеку нечем. Отвечает только тому, у кого токен есть.
 */
export type PasswordLinkState =
  | { outcome: 'live'; fullName: string; phoneE164: string; expiresAt: Date }
  | { outcome: DeadAccessLinkOutcome };

export const readPasswordLink = async (token: string, now: Date = new Date()): Promise<PasswordLinkState> => {
  const state = accessLinkState(await findAccessLinkByTokenHash(hashInviteToken(token)), 'password', now);

  if (state.outcome !== 'live') {
    return { outcome: state.outcome };
  }

  return {
    outcome: 'live',
    fullName: state.link.fullName,
    phoneE164: state.link.phoneE164,
    expiresAt: state.link.expiresAt,
  };
};
