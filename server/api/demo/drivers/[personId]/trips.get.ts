import { NotDemoDriverError } from '#server/services/demo/errors';
import { readDemoDriverTrips } from '#server/services/demo/readDemoDriverTrips';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { DEMO_EDITOR_ROLES } from '#shared/access';
import type { DemoDriverTripsResponse } from '#shared/types/demo';

// Последние завершённые поездки демо-водителя с итогом по журналу (issue #252).
export default defineEventHandler(async (event): Promise<DemoDriverTripsResponse> => {
  await requireEmployeeRole(event, DEMO_EDITOR_ROLES);

  const personId = requireUuidParam(event, 'personId');

  try {
    return await readDemoDriverTrips(personId);
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
