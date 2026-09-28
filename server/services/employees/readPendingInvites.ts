import { listPendingEmployeeInvites } from '#server/repositories/employeeInvites';
import { buildInvitePageLink } from '#server/services/employees/employeeLinks';
import { canInviteRole, type EmployeeActor } from '#server/services/employees/roles';
import type { EmployeeInvitesResponse } from '#shared/types/employee';

/**
 * Висящие приглашения — те, по которым ещё можно завести учётку.
 *
 * Принятые, отозванные и просроченные сюда не попадают: по ним учётку уже не завести,
 * а принятое к тому же стоит в списке учёток самим сотрудником (issue #132).
 *
 * Видны все висящие, а не только те, что отзывающий вправе отозвать: админ должен знать,
 * что владелец уже выписал ссылку на второго админа, даже если закрыть её не может.
 * Право на отзыв приезжает признаком, решённым тем же правилом, что сама ручка отзыва.
 *
 * Ссылка приезжает, пока приглашение живо (issue #267), — но только тому, кто вправе её
 * выпустить: ссылка и есть учётка с чужой ролью, и админ, скопировавший приглашение владельца
 * на второго админа, завёл бы её себе.
 */
export type ReadPendingInvitesRequest = {
  actor: EmployeeActor;
  /** Схема и хост приложения — из запроса: ссылка ведёт туда же. */
  appOrigin: string;
  now?: Date;
};

export const readPendingInvites = async (
  request: ReadPendingInvitesRequest,
): Promise<EmployeeInvitesResponse> => {
  const rows = await listPendingEmployeeInvites(request.now ?? new Date());

  return {
    invites: rows.map((row) => {
      const revocable = canInviteRole(request.actor.role, row.role);

      return {
        inviteId: row.id,
        role: row.role,
        fullName: row.fullName,
        phoneE164: row.phoneE164,
        invitedByName: row.invitedByName,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        revocable,
        link: revocable && row.token !== null ? buildInvitePageLink(request.appOrigin, row.token) : null,
      };
    }),
  };
};
