// `createError` берётся из `h3` явно — см. `denial.ts`: у обёртки Nuxt номер ответа
// необязателен, а отказ без номера не отказ.
import { createError, type H3Error } from 'h3';

import { plainText, type TextKey } from '#server/bot/texts';
import type { Language } from '#server/generated/prisma/enums';
import { GiftNotClaimableError, GiftNotFoundError } from '#server/services/gifts/errors';
import type { MemberGiftDenialCode, MemberGiftDenialPayload } from '#shared/types/rewards';

/**
 * Отказ «Забрать» подарок, приведённый к ответу HTTP: код — экрану, текст — водителю на его
 * языке (issue #219). Устроен как `memberChestDenial.ts`.
 *
 * `404` — подарка нет или он чужой: одним ответом, чужому незачем знать, что по этому
 * идентификатору что-то есть. `409` — подарок уже на балансе: повторное нажатие или прогон
 * по сроку успел раньше.
 */

const DENIALS: Readonly<Record<MemberGiftDenialCode, { status: 404 | 409; key: TextKey }>> = {
  gift_not_found: { status: 404, key: 'gift_denied_not_found' },
  gift_not_claimable: { status: 409, key: 'gift_denied_not_claimable' },
};

const STATUS_MESSAGE: Readonly<Record<404 | 409, string>> = {
  404: 'Not Found',
  409: 'Conflict',
};

/** Код отказа по доменной ошибке. `null` — ошибка не про подарок, и отказом её не назвать. */
export const giftDenialCode = (error: unknown): MemberGiftDenialCode | null => {
  if (error instanceof GiftNotFoundError) {
    return 'gift_not_found';
  }

  if (error instanceof GiftNotClaimableError) {
    return 'gift_not_claimable';
  }

  return null;
};

export const denyMemberGift = (code: MemberGiftDenialCode, language: Language): H3Error => {
  const { status, key } = DENIALS[code];

  return createError({
    statusCode: status,
    statusMessage: STATUS_MESSAGE[status],
    message: plainText(key, language),
    data: { code } satisfies MemberGiftDenialPayload,
  });
};
