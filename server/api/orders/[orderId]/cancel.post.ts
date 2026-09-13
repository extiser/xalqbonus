import { cancelOfficeOrder } from '#server/services/orders/cancelOfficeOrder';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { explainOfficeOrderFailure } from '#server/utils/officeOrderFailure';
import { requireUuidParam } from '#server/utils/query';
import { ORDER_ROLES } from '#shared/access';
import type { OfficeOrderResponse } from '#shared/types/orders';

// Отмена заказа сотрудником: причина `employee`, баллы и остаток возвращаются. Повтор отвечает
// «заказ уже отменён».
export default defineEventHandler(async (event): Promise<OfficeOrderResponse> => {
  const employee = await requireEmployeeRole(event, ORDER_ROLES);
  const orderId = requireUuidParam(event, 'orderId');

  try {
    return { order: await cancelOfficeOrder(employee, orderId) };
  } catch (error) {
    throw explainOfficeOrderFailure(error) ?? error;
  }
});
