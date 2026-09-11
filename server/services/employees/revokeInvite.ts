import {
  findEmployeeInviteById,
  markEmployeeInviteRevoked,
} from '#server/repositories/employeeInvites';
import type { InviteActor } from '#server/services/employees/issueInvite';
import { canInviteRole } from '#server/services/employees/roles';

/**
 * Отзыв выпущенного приглашения — до принятия.
 *
 * После принятия отзывать нечего: учётка уже заведена, и выключается она `disabled_at`,
 * а не ссылкой, которой её завели.
 *
 * Право на отзыв то же, что на выпуск: отозвать можно приглашение роли строго ниже своей.
 * Приглашение чужого выпуска при этом отзывается — сотрудник уходит в отпуск, а ссылку,
 * которую он выписал не тому человеку, закрывать надо сегодня.
 */

export type RevokeOutcome =
  | 'revoked'
  /** Приглашения с таким идентификатором нет. */
  | 'not_found'
  /** Роль приглашения не ниже роли отзывающего. */
  | 'forbidden'
  /** Уже принято или уже отозвано — отзывать нечего. */
  | 'not_pending';

export type RevokeInviteRequest = {
  actor: InviteActor;
  inviteId: string;
  now?: Date;
};

export const revokeInvite = async (request: RevokeInviteRequest): Promise<RevokeOutcome> => {
  const invite = await findEmployeeInviteById(request.inviteId);

  if (!invite) {
    return 'not_found';
  }

  if (!canInviteRole(request.actor.role, invite.role)) {
    return 'forbidden';
  }

  // Условие «ещё не принято и не отозвано» стоит в самом `UPDATE`: между чтением строки
  // выше и записью помещается принятие ссылки человеком, который её уже открыл.
  const revoked = await markEmployeeInviteRevoked(request.inviteId, request.now ?? new Date());

  return revoked ? 'revoked' : 'not_pending';
};
