import { consola } from 'consola';

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
 * от `issueOrder` «висящего заказа с таким кодом нет»: код выданного освободился. В обоих
 * случаях статус перечитывается, и ответ — «заказ уже выдан», а не «код не найден»: человек
 * нажал кнопку под заказом и должен узнать, что стало с этим заказом.
 */

const log = consola.withTag('orders:issue-office');

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
    const issued = await issueOrder({
      code: order.code,
      officeId: order.officeId,
      employeeId: worker.employeeId,
    });

    // `issueOrder` ищет по коду, а код между чтением выше и выдачей мог освободиться и достаться
    // новому заказу того же офиса. Окно — миллисекунды, совпадение кода — одно на сто тысяч,
    // но выдача не того заказа молчать не должна.
    if (issued.orderId !== order.id) {
      log.error('по коду выдан другой заказ', {
        requestedOrderId: order.id,
        issuedOrderId: issued.orderId,
      });

      throw new Error(`вместо заказа ${order.id} по коду выдан заказ ${issued.orderId}`);
    }
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
