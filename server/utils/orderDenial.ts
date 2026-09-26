// `createError` берётся из `h3` явно — см. `denial.ts`: у обёртки Nuxt номер ответа
// необязателен, а отказ без номера не отказ.
import { createError, type H3Error } from 'h3';

import { WEB_LANGUAGE } from '#shared/denials';
import {
  orderDenialText,
  type OrderDenialCode,
  type OrderDenialPayload,
} from '#shared/orderDenials';

/**
 * Отказ стойки — выдачи и отмены заказа, выдачи награды, — приведённый к ответу HTTP:
 * код — экрану, текст — человеку.
 *
 * `404` — заказа или награды нет или код не нашёлся, `409` — они есть, но уже не ждут:
 * выданы, отменены или сгорели раньше, чем дошло это нажатие. `403` — офис не открыт
 * этому сотруднику.
 */

type DenialStatus = 403 | 404 | 409;

const DENIAL_STATUS: Readonly<Record<OrderDenialCode, DenialStatus>> = {
  desk_code_not_found: 404,
  order_not_found: 404,
  order_already_issued: 409,
  order_already_cancelled: 409,
  reward_not_found: 404,
  reward_already_issued: 409,
  reward_already_expired: 409,
  office_not_open: 403,
};

const STATUS_MESSAGE: Readonly<Record<DenialStatus, string>> = {
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
};

export const denyOrder = (code: OrderDenialCode): H3Error => {
  const statusCode = DENIAL_STATUS[code];

  return createError({
    statusCode,
    statusMessage: STATUS_MESSAGE[statusCode],
    message: orderDenialText(code, WEB_LANGUAGE),
    data: { code } satisfies OrderDenialPayload,
  });
};
