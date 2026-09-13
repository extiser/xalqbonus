import { findOfficeOrderByCode } from '#server/services/orders/findOfficeOrderByCode';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { explainOfficeOrderFailure } from '#server/utils/officeOrderFailure';
import { readUuid } from '#server/utils/query';
import { ORDER_ROLES } from '#shared/access';
import type { OfficeOrderResponse } from '#shared/types/orders';

// Заказ по коду среди висящих заказов офиса: `?officeId=&code=`. Не нашлось — `404` без
// уточнений, код в чужом офисе — тоже.
export default defineEventHandler(async (event): Promise<OfficeOrderResponse> => {
  const employee = await requireEmployeeRole(event, ORDER_ROLES);
  const query = getQuery(event);
  const officeId = readUuid(query.officeId);

  if (!officeId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'параметр officeId не похож на uuid',
    });
  }

  const code = typeof query.code === 'string' ? query.code.trim() : '';

  try {
    return { order: await findOfficeOrderByCode(employee, officeId, code) };
  } catch (error) {
    throw explainOfficeOrderFailure(error) ?? error;
  }
});
