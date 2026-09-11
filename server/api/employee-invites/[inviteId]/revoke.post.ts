import { revokeInvite } from '#server/services/employees/revokeInvite';
import { requireEmployee } from '#server/utils/employeeAuth';
import { readUuid } from '#server/utils/query';
import type { EmployeeInviteRevokeResponse } from '#shared/types/employee';

// Отзыв приглашения до принятия. После принятия отзывать нечего: учётка уже заведена,
// и выключается она `disabled_at`, а не ссылкой, которой её завели.

export default defineEventHandler(async (event): Promise<EmployeeInviteRevokeResponse> => {
  const employee = await requireEmployee(event);
  const inviteId = readUuid(getRouterParam(event, 'inviteId'));

  if (!inviteId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'идентификатор приглашения не похож на uuid',
    });
  }

  const outcome = await revokeInvite({
    actor: { employeeId: employee.employeeId, role: employee.role },
    inviteId,
  });

  if (outcome === 'not_found') {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: 'приглашения с таким идентификатором нет',
    });
  }

  if (outcome === 'forbidden') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'отзывать можно только приглашение роли ниже своей',
    });
  }

  // Принятое и уже отозванное — один ответ: и то, и другое означает «этой ссылкой больше
  // никто не воспользуется», а различать их сотруднику незачем.
  if (outcome === 'not_pending') {
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      message: 'приглашение уже принято или отозвано',
    });
  }

  return { inviteId, revoked: true };
});
