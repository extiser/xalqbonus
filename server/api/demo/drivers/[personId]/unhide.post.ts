import { unhideDemoDriver } from '#server/services/demo/unhideDemoDriver';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { DEMO_EDITOR_ROLES } from '#shared/access';
import type { DemoDriverUnhideResponse } from '#shared/types/demo';

// «Вернуть» спрятанного демо-водителя (issue #252). Не спрятанный — тот же ответ.
export default defineEventHandler(async (event): Promise<DemoDriverUnhideResponse> => {
  await requireEmployeeRole(event, DEMO_EDITOR_ROLES);

  const personId = requireUuidParam(event, 'personId');

  if ((await unhideDemoDriver(personId)) === 'not_demo') {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: 'демо-водителя с таким идентификатором нет',
    });
  }

  return { personId, hidden: false };
});
