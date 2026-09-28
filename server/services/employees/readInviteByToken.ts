import { findEmployeeInviteByTokenHash } from '#server/repositories/employeeInvites';
import { inviteState, type InviteState } from '#server/services/employees/inviteState';
import { hashInviteToken } from '#server/services/employees/inviteToken';

/**
 * Приглашение по токену из адреса страницы (issue #267): у живого — имя, роль и телефон,
 * которые задал приглашающий, иначе — чем оно кончилось.
 *
 * Без входа: у открывшего ссылку учётки ещё нет. Отвечает только тому, у кого токен есть,
 * — а токен и есть приглашение.
 */
export const readInviteByToken = async (token: string, now: Date = new Date()): Promise<InviteState> =>
  inviteState(await findEmployeeInviteByTokenHash(hashInviteToken(token)), now);
