import type { OfficeOrder, OfficeOrderLine } from '#shared/types/orders';
import { formatNumber } from '~/utils/format';

/**
 * Суммы заказа в его валюте: в баллах у заказа за баллы, в сумах у розничного (issue #294).
 *
 * Пустая цена или сумма рядом с заполненной — не выбор экрана, а правило базы: у заказа
 * заполнена ровно одна сумма (`orders_payment_fields_check`), у позиции ровно одна цена
 * (`order_items_price_check`). Поэтому здесь берётся та, что есть, а не решается по способу.
 */

/** Единица суммы словом — для таблицы и карточки заказа. */
const PAYMENT_UNITS: Record<OfficeOrder['payment'], string> = {
  points: 'баллов',
  retail: 'сум',
};

export const orderPaymentUnit = (payment: OfficeOrder['payment']): string => PAYMENT_UNITS[payment];

export const orderLinePrice = (line: OfficeOrderLine): number => line.unitPoints ?? line.unitRetail ?? 0;

export const orderTotal = (order: OfficeOrder): number => order.totalPoints ?? order.totalRetail ?? 0;

/** «80 баллов», «120 000 сум». */
export const formatOrderTotal = (order: OfficeOrder): string =>
  `${formatNumber(orderTotal(order))} ${orderPaymentUnit(order.payment)}`;
