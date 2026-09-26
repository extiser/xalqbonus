import { cancelOfficeOrder } from '#server/services/orders/cancelOfficeOrder';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { explainOfficeOrderFailure } from '#server/utils/officeOrderFailure';
import { requireUuidParam } from '#server/utils/query';
import { ORDER_ROLES } from '#shared/access';
import type { OfficeOrderResponse } from '#shared/types/orders';

// Отмена заказа сотрудником: причина `employee`, баллы и остаток возвращаются. Повтор отвечает
// «заказ уже отменён».
export default defineEventHandler(async (event): Promise<OfficeOrderResponse> => {
  // Стойка открыта и демо-менеджеру (issue #205): ручку зовёт экран сотрудника в Mini App,
  // а офисы сотрудника ограничивают демо-учётку ДЕМО ОФИСОМ.
  const employee = await requireEmployeeRole(event, ORDER_ROLES, { allowDemo: true });
  const orderId = requireUuidParam(event, 'orderId');

  try {
    return { order: await cancelOfficeOrder(employee, orderId) };
  } catch (error) {
    throw explainOfficeOrderFailure(error) ?? error;
  }
});
