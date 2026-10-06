import { deleteDemoTrips } from '#server/services/demo/deleteDemoTrips';
import { DemoTripNotFoundError, NotDemoDriverError } from '#server/services/demo/errors';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { DEMO_EDITOR_ROLES } from '#shared/access';
import type { DemoTripsDeleteResponse } from '#shared/types/demo';

// Одна поездка демо-водителя — с баллом за неё и приветственным бонусом, если поездок
// после вступления стало меньше пяти (issue #422).
export default defineEventHandler(async (event): Promise<DemoTripsDeleteResponse> => {
  await requireEmployeeRole(event, DEMO_EDITOR_ROLES);

  const personId = requireUuidParam(event, 'personId');
  // Формата у заказа нет: чужой или пустой просто не найдётся среди поездок водителя.
  const orderId = getRouterParam(event, 'orderId', { decode: true }) ?? '';

  try {
    return await deleteDemoTrips({ personId, orderId });
  } catch (error) {
    if (error instanceof NotDemoDriverError) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Not Found',
        message: 'демо-водителя с таким идентификатором нет',
      });
    }

    if (error instanceof DemoTripNotFoundError) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Not Found',
        message: 'поездки с таким идентификатором у демо-водителя нет',
      });
    }

    throw error;
  }
});
