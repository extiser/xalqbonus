import type { EmployeeRole } from '#server/generated/prisma/enums';
import type { EmployeeInviteRow } from '#server/repositories/employeeInvites';

/**
 * Жива ли ссылка приглашения, а если нет — почему (issue #267). Одно правило на страницу
 * приглашения и на принятие: разойдись они, страница звала бы принять то, что принятие
 * отклонит.
 */

/** Чем кончилось приглашение, по которому уже не завести учётку. */
export type DeadInviteOutcome =
  /** Токена нет в базе: ссылка выдумана или испорчена по дороге. */
  | 'not_found'
  /** Срок вышел — 48 часов прошли. */
  | 'expired'
  /** Ссылка уже принята: она одноразовая. */
  | 'accepted'
  /** Приглашение отозвано. */
  | 'revoked';

export type LiveInvite = {
  inviteId: string;
  role: EmployeeRole;
  fullName: string;
  phoneE164: string;
  expiresAt: Date;
};

export type InviteState = { outcome: 'live'; invite: LiveInvite } | { outcome: DeadInviteOutcome };

export const inviteState = (invite: EmployeeInviteRow | null, now: Date): InviteState => {
  if (!invite) {
    return { outcome: 'not_found' };
  }

  // Принятое — раньше срока: принятую позавчера ссылку человек открывает, чтобы войти,
  // и ответ «устарела» увёл бы его просить новую вместо входа.
  if (invite.acceptedAt !== null) {
    return { outcome: 'accepted' };
  }

  if (invite.revokedAt !== null) {
    return { outcome: 'revoked' };
  }

  if (invite.expiresAt <= now) {
    return { outcome: 'expired' };
  }

  // Имени и телефона нет только у выпущенных до приёма в вебе, и живых среди них не осталось:
  // миграция их отозвала. Строка, дожившая до сюда вопреки ей, принята быть не может — учётку
  // не на что заводить, — и ответ ей тот же, что отозванной.
  if (invite.fullName === null || invite.phoneE164 === null) {
    return { outcome: 'revoked' };
  }

  return {
    outcome: 'live',
    invite: {
      inviteId: invite.id,
      role: invite.role,
      fullName: invite.fullName,
      phoneE164: invite.phoneE164,
      expiresAt: invite.expiresAt,
    },
  };
};
