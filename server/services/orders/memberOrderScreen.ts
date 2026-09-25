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

/** Тексты каталога на языке участника. */
export const memberOrderTexts = (language: Language): MemberOrderTexts => ({
  requestFailed: plainText('request_failed', language),
  catalogTitle: plainText('catalog_title', language),
  catalogAll: plainText('catalog_all', language),
  catalogEmpty: plainText('catalog_empty', language),
  sale: plainText('sale_label', language),
  officeSheetTitle: plainText('office_sheet_title', language),
  officeSheetSubtitle: plainText('office_sheet_subtitle', language),
  officeChange: plainText('office_change', language),
  officeChangeWarning: plainText('office_change_warning', language),
  save: plainText('button_save', language),
  cancel: plainText('button_cancel', language),
  showcaseEmpty: plainText('showcase_empty', language),
  showcaseFailed: plainText('showcase_failed', language),
  stockPieces: plainText('stock_pieces', language),
  decrease: plainText('stepper_decrease', language),
  increase: plainText('stepper_increase', language),
  increaseMore: plainText('stepper_increase_more', language),
  cartTotal: plainText('cart_total', language),
  balanceAfter: plainText('cart_balance_after', language),
  checkout: plainText('button_checkout', language),
  checkoutNothingSelected: plainText('checkout_nothing_selected', language),
  checkoutOverBalance: plainText('checkout_over_balance', language),
  confirmTitle: plainText('confirm_title', language),
  confirmNote: plainText('confirm_note', language),
  placeOrder: plainText('button_place_order', language),
  officePick: plainText('office_pick', language),
  officePickTitle: plainText('office_pick_title', language),
  officePickSubtitle: plainText('office_pick_subtitle', language),
  addToCart: plainText('button_add_to_cart', language),
  productSoldOutInOffice: plainText('product_sold_out_in_office', language),
  productSoldOut: plainText('product_sold_out', language),
  productMissingInOffice: plainText('product_missing_in_office', language),
  officeHint: plainText('office_hint', language),
  officeHintClose: plainText('office_hint_close', language),
  catalogExitTitle: plainText('catalog_exit_title', language),
  catalogExitHint: plainText('catalog_exit_hint', language),
  stay: plainText('button_stay', language),
  exit: plainText('button_exit', language),
});
