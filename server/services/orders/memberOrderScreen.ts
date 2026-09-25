import { plainText, type TextKey } from '#server/bot/texts';
import type { Language, OrderCancelReason, OrderStatus } from '#server/generated/prisma/enums';
import type { OrderLineRow, PersonOrderRow } from '#server/repositories/orders';
import { toMemberOffice } from '#server/services/offices/readMemberOffices';
import { formatCalendarDate, formatClockTime, formatDayMonth } from '#server/utils/parkTime';
import type { MemberOrder, MemberOrderTexts } from '#shared/types/miniapp';

/**
 * Во что превращается заказ на экране водителя.
 *
 * Решений здесь нет — только перевод строки заказа на язык водителя. Отдельным модулем,
 * как `memberScreen.ts`: вызывающих два — список заказов и один заказ после оформления
 * или отмены.
 */

/**
 * Причина отмены словами — полной таблицей: новое значение перечисления обязано сломать
 * сборку здесь, а не показать водителю пустое место.
 */
const CANCEL_REASON_KEYS: Readonly<Record<OrderCancelReason, TextKey>> = {
  driver: 'order_cancel_reason_driver',
  employee: 'order_cancel_reason_employee',
  expired: 'order_cancel_reason_expired',
};

/**
 * Слово состояния — полной таблицей, как причины: новый статус обязан сломать сборку здесь.
 * Без даты: момент стоит отдельно, после точки (`stateHint`).
 */
const STATE_WORD_KEYS: Readonly<Record<OrderStatus, TextKey>> = {
  pending: 'order_status_pending',
  issued: 'order_state_issued',
  cancelled: 'order_state_cancelled',
};

/**
 * Момент в зоне парка. Цифрами — одинаково на обоих языках. Срок висящего — «23.09, 14:32»:
 * заказ живёт сутки, и год при нём лишний. Момент закрытия — «20.09.2026, 16:10»: к закрытому
 * заказу возвращаются и через месяц.
 */
const formatShortMoment = (moment: Date): string => `${formatDayMonth(moment)}, ${formatClockTime(moment)}`;

const formatMoment = (moment: Date): string => `${formatCalendarDate(moment)}, ${formatClockTime(moment)}`;

const stateHint = (row: PersonOrderRow, language: Language): string => {
  switch (row.status) {
    case 'pending':
      return plainText('order_expires_short', language, { moment: formatShortMoment(row.expiresAt) });
    case 'issued':
      return row.issuedAt ? formatMoment(row.issuedAt) : '';
    case 'cancelled':
      return row.cancelledAt ? formatMoment(row.cancelledAt) : '';
  }
};

export const describeMemberOrder = (
  row: PersonOrderRow,
  lines: OrderLineRow[],
  language: Language,
): MemberOrder => {
  const pending = row.status === 'pending';

  return {
    orderId: row.id,
    number: row.number,
    title: plainText('order_title', language, { number: String(row.number) }),
    status: row.status,
    office: toMemberOffice(row.office),
    totalPoints: row.totalPoints,
    lines: lines.map((line) => ({
      productId: line.productId,
      name: line.name,
      quantity: line.quantity,
      unitPoints: line.unitPoints,
      photoPath: line.photoPath,
      photoUpdatedAt: line.photoUpdatedAt.toISOString(),
    })),
    // Код выданного и отменённого освобождён частичным индексом и может уже принадлежать
    // чужому висящему заказу — показывать его незачем.
    code: pending ? row.code : null,
    stateWord: plainText(STATE_WORD_KEYS[row.status], language),
    stateHint: stateHint(row, language),
    reasonText:
      row.status === 'cancelled' && row.cancelReason
        ? plainText(CANCEL_REASON_KEYS[row.cancelReason], language)
        : null,
  };
};

/** Раскладывает позиции по заказам. */
export const groupLinesByOrder = (lines: OrderLineRow[]): Map<string, OrderLineRow[]> => {
  const result = new Map<string, OrderLineRow[]>();

  for (const line of lines) {
    const orderLines = result.get(line.orderId) ?? [];

    orderLines.push(line);
    result.set(line.orderId, orderLines);
  }

  return result;
};

/** Тексты витрины и заказа на языке участника. */
export const memberOrderTexts = (language: Language): MemberOrderTexts => ({
  back: plainText('button_back', language),
  requestFailed: plainText('request_failed', language),
  officesTitle: plainText('offices_title', language),
  officesEmpty: plainText('offices_empty', language),
  officesFailed: plainText('offices_failed', language),
  openMap: plainText('office_open_map', language),
  showcaseEmpty: plainText('showcase_empty', language),
  showcaseFailed: plainText('showcase_failed', language),
  noPhoto: plainText('product_no_photo', language),
  pieces: plainText('unit_pieces', language),
  points: plainText('unit_points', language),
  inStock: plainText('showcase_in_stock', language),
  cartTotal: plainText('cart_total', language),
  balanceAfter: plainText('cart_balance_after', language),
  checkout: plainText('button_checkout', language),
  checkoutNothingSelected: plainText('checkout_nothing_selected', language),
  checkoutOverBalance: plainText('checkout_over_balance', language),
  confirmTitle: plainText('confirm_title', language),
  confirmNote: plainText('confirm_note', language),
  placeOrder: plainText('button_place_order', language),
  editOrder: plainText('button_edit_order', language),
});
