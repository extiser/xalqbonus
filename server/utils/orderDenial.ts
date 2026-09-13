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
 * Отказ выдачи или отмены сотрудником, приведённый к ответу HTTP: код — экрану, текст — человеку.
 *
 * `404` — заказа нет или код не нашёлся, `409` — заказ есть, но уже не висит: выдан
 * или отменён раньше, чем дошло это нажатие.
 */

const DENIAL_STATUS: Readonly<Record<OrderDenialCode, 404 | 409>> = {
  order_code_not_found: 404,
  order_not_found: 404,
  order_already_issued: 409,
  order_already_cancelled: 409,
};

const STATUS_MESSAGE: Readonly<Record<404 | 409, string>> = {
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
