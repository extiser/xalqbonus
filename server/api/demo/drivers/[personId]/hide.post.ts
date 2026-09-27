import { hideDemoDriver } from '#server/services/demo/hideDemoDriver';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { DEMO_EDITOR_ROLES } from '#shared/access';
import type { DemoDriverHideResponse } from '#shared/types/demo';

// «Спрятать» сгенерированного демо-водителя (issue #252). Повторное — тот же ответ.
export default defineEventHandler(async (event): Promise<DemoDriverHideResponse> => {
  await requireEmployeeRole(event, DEMO_EDITOR_ROLES);

  const personId = requireUuidParam(event, 'personId');
  const outcome = await hideDemoDriver(personId);

  if (outcome === 'not_demo') {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: 'демо-водителя с таким идентификатором нет',
    });
  }

  if (outcome === 'viewer_driver') {
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      message: 'Водителя зрителя не прячут: его прячет выключение зрителя',
    });
  }

  return { personId, hidden: true };
});
