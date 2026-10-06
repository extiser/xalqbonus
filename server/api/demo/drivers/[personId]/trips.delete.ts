import { deleteDemoTrips } from '#server/services/demo/deleteDemoTrips';
import { NotDemoDriverError } from '#server/services/demo/errors';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { DEMO_EDITOR_ROLES } from '#shared/access';
import type { DemoTripsDeleteResponse } from '#shared/types/demo';

// Все поездки демо-водителя — с баллами за них и приветственным бонусом (issue #422).
export default defineEventHandler(async (event): Promise<DemoTripsDeleteResponse> => {
  await requireEmployeeRole(event, DEMO_EDITOR_ROLES);

  const personId = requireUuidParam(event, 'personId');

  try {
    return await deleteDemoTrips({ personId, orderId: null });
  } catch (error) {
    if (error instanceof NotDemoDriverError) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Not Found',
        message: 'демо-водителя с таким идентификатором нет',
      });
    }

    throw error;
  }
});
