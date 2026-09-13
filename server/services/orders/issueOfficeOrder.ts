import { findOfficeOrder } from '#server/repositories/orders';
import { requireOpenOffice, type OfficeWorker } from '#server/services/offices/employeeOffices';
import {
  OrderNotFoundError,
  OrderNotPendingError,
  UnknownOrderError,
} from '#server/services/orders/errors';
import { issueOrder } from '#server/services/orders/issueOrder';
import { readOfficeOrder } from '#server/services/orders/officeOrderView';
import type { OfficeOrder } from '#shared/types/orders';

/**
 * Выдача заказа сотрудником — по заказу, открытому на экране.
 *
 * Выдачу делает `issueOrder`, и только он: здесь нет ни одной записи. Этот сервис отвечает
 * на два вопроса, которых `issueOrder` не задаёт, — открыт ли офис заказа этому сотруднику
 * и что сказать, если заказ уже не висит.
 *
 * **Двойное нажатие «Выдать» второй операции не делает — это гарантирует `issueOrder`.**
 * Второй запрос либо сразу видит `issued`, либо, если пришёл вровень с первым, получает
 * от `issueOrder` `OrderNotFoundError` — заказ уже не висит. Тогда статус перечитывается,
 * и ответ — «заказ уже выдан»: человек нажал кнопку под заказом и должен узнать, что стало
 * с этим заказом.
 */

export const issueOfficeOrder = async (
  worker: OfficeWorker,
  orderId: string,
): Promise<OfficeOrder> => {
  const order = await findOfficeOrder(orderId);

  if (!order) {
    throw new UnknownOrderError(orderId);
  }

  await requireOpenOffice(worker, order.officeId);

  if (order.status !== 'pending') {
    throw new OrderNotPendingError(order.id, order.status);
  }

  try {
    await issueOrder({ orderId: order.id, employeeId: worker.employeeId });
  } catch (error) {
    if (!(error instanceof OrderNotFoundError)) {
      throw error;
    }

    const current = await findOfficeOrder(orderId);

    if (current && current.status !== 'pending') {
      throw new OrderNotPendingError(current.id, current.status);
    }

    throw error;
  }

  const result = await readOfficeOrder(orderId);

  if (!result) {
    throw new Error(`выданный заказ ${orderId} не прочитался`);
  }

  return result;
};
