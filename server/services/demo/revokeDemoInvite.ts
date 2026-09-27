import { demoInviteExists, markDemoInviteRevoked } from '#server/repositories/demoInvites';

/**
 * Отзыв приглашения в демо до принятия (issue #252). Принятое не отзывается: зритель уже
 * есть, и выключается он в списке зрителей, а не ссылкой.
 */
export type RevokeDemoInviteOutcome =
  | 'revoked'
  | 'not_found'
  /** Уже принято или уже отозвано. */
  | 'not_pending';

export const revokeDemoInvite = async (inviteId: string, now: Date = new Date()): Promise<RevokeDemoInviteOutcome> => {
  // Условие «не принято и не отозвано» — в самом `UPDATE`; отличить «нет» от «поздно» можно
  // только после.
  if (await markDemoInviteRevoked(inviteId, now)) {
    return 'revoked';
  }

  return (await demoInviteExists(inviteId)) ? 'not_pending' : 'not_found';
};
