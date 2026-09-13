import { findOfficeOrder } from '#server/repositories/orders';
import { requireOpenOffice, type OfficeWorker } from '#server/services/offices/employeeOffices';
import { cancelOrder } from '#server/services/orders/cancelOrder';
import { UnknownOrderError } from '#server/services/orders/errors';
import { readOfficeOrder } from '#server/services/orders/officeOrderView';
import type { OfficeOrder } from '#shared/types/orders';

/**
 * Отмена заказа сотрудником: причина `employee`, автор — вошедший.
 *
 * Возврат баллов и остатка делает `cancelOrder` — тот же сервис, что у водителя и просрочки,
 * трёх путей возврата нет. Здесь проверяется то, что `cancelOrder` оставляет вызывающему:
 * открыт ли офис заказа этому сотруднику.
 *
 * Повтор безопасен: второй вызов получает от `cancelOrder` `OrderNotPendingError` и не делает
 * ни одной записи, а ручка показывает «уже отменён».
 */

export const cancelOfficeOrder = async (
  worker: OfficeWorker,
  orderId: string,
): Promise<OfficeOrder> => {
  const order = await findOfficeOrder(orderId);

  if (!order) {
    throw new UnknownOrderError(orderId);
  }

  await requireOpenOffice(worker, order.officeId);

  await cancelOrder({ orderId, reason: 'employee', employeeId: worker.employeeId });

  const result = await readOfficeOrder(orderId);

  if (!result) {
    throw new Error(`отменённый заказ ${orderId} не прочитался`);
  }

  return result;
};
