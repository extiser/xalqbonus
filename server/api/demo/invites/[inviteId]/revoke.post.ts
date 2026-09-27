import { revokeDemoInvite } from '#server/services/demo/revokeDemoInvite';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { DEMO_EDITOR_ROLES } from '#shared/access';
import type { DemoInviteRevokeResponse } from '#shared/types/demo';

// Отзыв приглашения в демо до принятия (issue #252).
export default defineEventHandler(async (event): Promise<DemoInviteRevokeResponse> => {
  await requireEmployeeRole(event, DEMO_EDITOR_ROLES);

  const inviteId = requireUuidParam(event, 'inviteId');
  const outcome = await revokeDemoInvite(inviteId);

  if (outcome === 'not_found') {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: 'приглашения с таким идентификатором нет',
    });
  }

  // Принятое и отозванное — один ответ: этой ссылкой больше никто не воспользуется.
  if (outcome === 'not_pending') {
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      message: 'Приглашение уже принято или отозвано',
    });
  }

  return { inviteId, revoked: true };
});
