import {
  DuplicateOrderItemError,
  EmptyOrderError,
  InvalidOrderQuantityError,
} from '#server/services/orders/errors';
import { readOfficeOrder } from '#server/services/orders/officeOrderView';
import { placeDeskOrder } from '#server/services/orders/placeDeskOrder';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { explainOfficeOrderFailure } from '#server/utils/officeOrderFailure';
import { readOrderItemsBody } from '#server/utils/orderItemsBody';
import { readUuid } from '#server/utils/query';
import { ORDER_ROLES } from '#shared/access';
import { ORDER_PAYMENTS, type DeskOrderRequestBody, type OfficeOrderResponse } from '#shared/types/orders';

/**
 * Заказ у стойки: сотрудник оформляет за водителя, за баллы или за розницу, и заказ сразу
 * выдан (issue #294).
 *
 * Логики здесь нет: офис, водитель, цены, остаток, баллы и оба движения остатка решает
 * `placeDeskOrder` одной транзакцией. Ручка разбирает тело, зовёт сервис и переводит его
 * отказ в код словаря стойки.
 *
 * Кто оформил — решает сессия, а не тело: сотрудника в запросе нет.
 */

const badRequest = (message: string) =>
  createError({ statusCode: 400, statusMessage: 'Bad Request', message });

export default defineEventHandler(async (event): Promise<OfficeOrderResponse> => {
  // Роли — те же, что у выдачи: у стойки стоит любая роль, а офис решает правило офисов.
  const employee = await requireEmployeeRole(event, ORDER_ROLES, { allowDemo: true });
  const body = await readBody<Partial<DeskOrderRequestBody> | null>(event);
  const officeId = readUuid(body?.officeId);
  const personId = readUuid(body?.personId);
  const payment = ORDER_PAYMENTS.find((value) => value === body?.payment);
  const items = readOrderItemsBody(body?.items);

  if (!officeId || !personId || !payment || !items) {
    throw badRequest('нужны officeId, personId, payment (points | retail) и позиции { productId, quantity }');
  }

  let orderId: string;

  try {
    const placed = await placeDeskOrder(employee, { officeId, personId, payment, items, actor: 'web' });

    orderId = placed.orderId;
  } catch (error) {
    const denial = explainOfficeOrderFailure(error);

    if (denial) {
      throw denial;
    }

    // Пустой заказ, дробное количество, товар дважды — экран такого не шлёт: это испорченный
    // запрос, а не ответ человеку.
    if (
      error instanceof EmptyOrderError ||
      error instanceof InvalidOrderQuantityError ||
      error instanceof DuplicateOrderItemError
    ) {
      throw badRequest(error.message);
    }

    throw error;
  }

  // Заказ читается тем же путём, что строка «Заказов офиса»: экран после оформления показывает
  // ровно то, что сотрудник увидит, открыв заказ из списка.
  const order = await readOfficeOrder(orderId);

  if (!order) {
    throw new Error(`оформленный у стойки заказ ${orderId} не прочитался`);
  }

  return { order };
});
