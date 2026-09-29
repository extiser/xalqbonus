import type { OrderItemRequest } from '#server/services/orders/orderItems';
import { readUuid } from '#server/utils/query';

/**
 * Позиции заказа из тела запроса — `[{ productId, quantity }]`. Одна на оформление водителем
 * в Mini App и сотрудником у стойки (issue #294).
 *
 * Здесь проверяется только форма. Смысл — количество, дубли, пустоту — решает ядро
 * (`validateOrderItems`): у его отказов свои ошибки, и второй проверки того же здесь быть
 * не должно. `null` — форма не та.
 */
export const readOrderItemsBody = (value: unknown): OrderItemRequest[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  const items: OrderItemRequest[] = [];

  for (const entry of value as unknown[]) {
    const record = typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {};
    const productId = readUuid(record.productId);

    if (!productId || typeof record.quantity !== 'number') {
      return null;
    }

    items.push({ productId, quantity: record.quantity });
  }

  return items;
};
