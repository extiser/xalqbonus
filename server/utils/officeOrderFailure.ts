import type { H3Error } from 'h3';

import { OfficeNotOpenError } from '#server/services/offices/errors';
import {
  OrderNotFoundError,
  OrderNotPendingError,
  UnknownOrderError,
} from '#server/services/orders/errors';
import { denyAccess } from '#server/utils/denial';
import { denyOrder } from '#server/utils/orderDenial';

/**
 * Что ответить сотруднику на отказ ручки заказов офиса.
 *
 * Чужой офис — отказ двери `role_not_allowed`: работать в этом офисе человеку не положено.
 * Остальное — отказы заказа из своего словаря (`shared/orderDenials.ts`). Всё, чего здесь нет,
 * отказом не является и уходит пятисоткой: это поломка, а не ответ человеку.
 */
export const explainOfficeOrderFailure = (error: unknown): H3Error | null => {
  if (error instanceof OfficeNotOpenError) {
    return denyAccess('role_not_allowed');
  }

  if (error instanceof OrderNotFoundError) {
    return denyOrder('order_code_not_found');
  }

  if (error instanceof UnknownOrderError) {
    return denyOrder('order_not_found');
  }

  if (error instanceof OrderNotPendingError) {
    return denyOrder(error.status === 'issued' ? 'order_already_issued' : 'order_already_cancelled');
  }

  return null;
};
