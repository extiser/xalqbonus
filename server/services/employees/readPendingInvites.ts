import { listPendingEmployeeInvites } from '#server/repositories/employeeInvites';
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
 */
export type ReadPendingInvitesRequest = {
  actor: EmployeeActor;
  now?: Date;
};

export const readPendingInvites = async (
  request: ReadPendingInvitesRequest,
): Promise<EmployeeInvitesResponse> => {
  const rows = await listPendingEmployeeInvites(request.now ?? new Date());

  return {
    invites: rows.map((row) => ({
      inviteId: row.id,
      role: row.role,
      invitedByName: row.invitedByName,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      revocable: canInviteRole(request.actor.role, row.role),
    })),
  };
};
