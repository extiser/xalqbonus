import { createDemoManager } from '#server/services/demo/createDemoManager';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { DEMO_EDITOR_ROLES } from '#shared/access';
import type { DemoManagerCreateResponse } from '#shared/types/demo';

// Заведение демо-менеджера без офиса (issue #252). Демо-офисы закрепляются следом —
// `PUT /api/demo/manager/offices`. Показ — из перечитанной сводки `GET /api/demo`.
type ManagerBody = {
  phone?: unknown;
};

export default defineEventHandler(async (event): Promise<DemoManagerCreateResponse> => {
  await requireEmployeeRole(event, DEMO_EDITOR_ROLES);

  const body = await readBody<ManagerBody | null>(event);
  const result = await createDemoManager(typeof body?.phone === 'string' ? body.phone : '');

  switch (result.outcome) {
    case 'created':
      break;

    case 'phone_invalid':
      throw createError({
        statusCode: 400,
        statusMessage: 'Bad Request',
        message: 'Телефон — узбекский номер вида +998 XX XXX XX XX',
        data: { field: 'phone' },
      });

    case 'phone_taken':
      throw createError({
        statusCode: 409,
        statusMessage: 'Conflict',
        message: 'Этот телефон уже у другой учётки сотрудника',
      });

    case 'driver_link_exists':
      throw createError({
        statusCode: 409,
        statusMessage: 'Conflict',
        message: 'Этот телефон за водителем программы: водителем и сотрудником быть нельзя',
      });

    case 'already_exists':
      throw createError({
        statusCode: 409,
        statusMessage: 'Conflict',
        message: 'Демо-менеджер уже заведён',
      });
  }

  return { employeeId: result.employeeId };
});
