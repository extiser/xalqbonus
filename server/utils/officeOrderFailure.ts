import type { H3Error } from 'h3';

import { DeskCodeNotFoundError } from '#server/services/desk/errors';
import { OfficeNotOpenError } from '#server/services/offices/errors';
import {
  OrderNotFoundError,
  OrderNotPendingError,
  UnknownOrderError,
} from '#server/services/orders/errors';
import { RewardNotAwaitingError, UnknownRewardError } from '#server/services/rewards/errors';
import { denyAccess } from '#server/utils/denial';
import { denyOrder } from '#server/utils/orderDenial';

/**
 * Что ответить сотруднику на отказ стойки — ручек заказов офиса, поиска по коду и выдачи
 * награды.
 *
 * Чужой офис — отказ двери `role_not_allowed`: работать в этом офисе человеку не положено.
 * Остальное — отказы заказа из своего словаря (`shared/orderDenials.ts`). Всё, чего здесь нет,
 * отказом не является и уходит пятисоткой: это поломка, а не ответ человеку.
 */
export const explainOfficeOrderFailure = (error: unknown): H3Error | null => {
  if (error instanceof OfficeNotOpenError) {
    return denyAccess('role_not_allowed');
  }

  if (error instanceof DeskCodeNotFoundError) {
    return denyOrder('desk_code_not_found');
  }

  // Заказ перестал висеть между чтением и выдачей: `issueOfficeOrder` перечитывает статус
  // и отвечает точнее, а сюда доходит только заказ, которого нет вовсе.
  if (error instanceof OrderNotFoundError) {
    return denyOrder('order_not_found');
  }

  if (error instanceof UnknownOrderError) {
    return denyOrder('order_not_found');
  }

  if (error instanceof OrderNotPendingError) {
    return denyOrder(error.status === 'issued' ? 'order_already_issued' : 'order_already_cancelled');
  }

  if (error instanceof UnknownRewardError) {
    return denyOrder('reward_not_found');
  }

  if (error instanceof RewardNotAwaitingError) {
    if (error.status === 'issued') {
      return denyOrder('reward_already_issued');
    }

    return denyOrder(error.status === 'expired' ? 'reward_already_expired' : 'reward_not_found');
  }

  return null;
};
