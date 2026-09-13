// `createError` берётся из `h3` явно — см. `denial.ts`: у обёртки Nuxt номер ответа
// необязателен, а отказ без номера не отказ.
import { createError, type H3Error } from 'h3';

import { plainText, type TextKey } from '#server/bot/texts';
import type { Language } from '#server/generated/prisma/enums';
import type { MemberOrderDenial } from '#server/services/orders/explainOrderFailure';
import type { MemberOrderDenialCode, MemberOrderDenialPayload } from '#shared/types/miniapp';

/**
 * Отказ заказа водителю, приведённый к ответу HTTP: код — экрану, текст — человеку.
 *
 * Словарь здесь водительский (`server/bot/texts.ts`), а не словарь двери веба: у водителя
 * два языка, и отказ говорит на том, который он выбрал (docs/decisions.md → «Словарь один
 * на веб и с водительским не объединяется»).
 *
 * `404` — заказа нет или он чужой, `409` — запрос верный, но состояние мира не позволяет:
 * баллов, товара или открытого офиса не оказалось в момент оформления.
 */

const DENIALS: Readonly<Record<MemberOrderDenialCode, { status: 404 | 409; key: TextKey }>> = {
  office_unavailable: { status: 409, key: 'order_denied_office_unavailable' },
  product_unavailable: { status: 409, key: 'order_denied_product_unavailable' },
  insufficient_stock: { status: 409, key: 'order_denied_insufficient_stock' },
  insufficient_points: { status: 409, key: 'order_denied_insufficient_points' },
  order_not_found: { status: 404, key: 'order_denied_not_found' },
  order_not_pending: { status: 409, key: 'order_denied_not_pending' },
};

const STATUS_MESSAGE: Readonly<Record<404 | 409, string>> = {
  404: 'Not Found',
  409: 'Conflict',
};

export const denyMemberOrder = (denial: MemberOrderDenial, language: Language): H3Error => {
  const { status, key } = DENIALS[denial.code];
  const values: Readonly<Record<string, string>> =
    denial.code === 'insufficient_stock'
      ? { product: denial.productName, available: String(denial.available) }
      : {};

  return createError({
    statusCode: status,
    statusMessage: STATUS_MESSAGE[status],
    message: plainText(key, language, values),
    data: { code: denial.code } satisfies MemberOrderDenialPayload,
  });
};
