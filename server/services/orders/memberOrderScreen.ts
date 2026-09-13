import { plainText, type TextKey } from '#server/bot/texts';
import type { Language, OrderCancelReason } from '#server/generated/prisma/enums';
import type { OrderLineRow, PersonOrderRow } from '#server/repositories/orders';
import { formatCalendarDate, formatClockTime } from '#server/utils/parkTime';
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

/** Момент в зоне парка: «15.09.2026 14:32». Цифрами — одинаково на обоих языках. */
const formatMoment = (moment: Date): string =>
  `${formatCalendarDate(moment)} ${formatClockTime(moment)}`;

const statusText = (row: PersonOrderRow, language: Language): string => {
  if (row.status === 'issued' && row.issuedAt) {
    return plainText('order_status_issued', language, { moment: formatMoment(row.issuedAt) });
  }

  if (row.status === 'cancelled' && row.cancelledAt) {
    return plainText('order_status_cancelled', language, {
      moment: formatMoment(row.cancelledAt),
    });
  }

  return plainText('order_status_pending', language);
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
    officeName: row.officeName,
    officeAddress: row.officeAddress,
    totalPoints: row.totalPoints,
    lines: lines.map((line) => ({
      productId: line.productId,
      name: line.name,
      quantity: line.quantity,
      unitPoints: line.unitPoints,
    })),
    // Код выданного и отменённого освобождён частичным индексом и может уже принадлежать
    // чужому висящему заказу — показывать его незачем.
    code: pending ? row.code : null,
    expiresNote: pending
      ? plainText('order_expires', language, { moment: formatMoment(row.expiresAt) })
      : null,
    statusText: statusText(row, language),
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
  exchangePoints: plainText('button_exchange_points', language),
  myOrders: plainText('button_my_orders', language),
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
  codeTitle: plainText('order_code_title', language),
  cancelOrder: plainText('button_cancel_order', language),
  cancelQuestion: plainText('cancel_order_question', language),
  cancelYes: plainText('button_cancel_order_yes', language),
  cancelNo: plainText('button_cancel_order_no', language),
  ordersTitle: plainText('orders_title', language),
  ordersEmpty: plainText('orders_empty', language),
  ordersFailed: plainText('orders_failed', language),
});
