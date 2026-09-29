import type { StockRow } from '#server/repositories/stock';
import {
  DuplicateOrderItemError,
  EmptyOrderError,
  InsufficientStockError,
  InvalidOrderQuantityError,
} from '#server/services/orders/errors';

/**
 * Позиции заказа до и после блокировки остатка — общие для оформления водителем
 * (`placeOrder`) и сотрудником у стойки (`placeDeskOrder`).
 *
 * Одним модулем, а не копией в каждом: порядок позиций задаёт порядок блокировок остатка,
 * и два оформления с разным порядком встали бы в дедлок на общих товарах.
 */

export type OrderItemRequest = {
  productId: string;
  quantity: number;
};

/**
 * Проверяет вход до похода в базу: пустой заказ, нецелое количество, один товар дважды.
 *
 * Позиции возвращаются отсортированными по `product_id` — в том порядке, в котором потом
 * берутся блокировки остатка. Сортировка здесь, а не перед блокировкой: порядок обязан
 * совпадать у оформления, выдачи и отмены, и заводить его в трёх местах значит однажды
 * развести их.
 */
export const validateOrderItems = <Item extends OrderItemRequest>(items: Item[]): Item[] => {
  if (items.length === 0) {
    throw new EmptyOrderError();
  }

  const seen = new Set<string>();

  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new InvalidOrderQuantityError(item.productId, item.quantity);
    }

    if (seen.has(item.productId)) {
      throw new DuplicateOrderItemError(item.productId);
    }

    seen.add(item.productId);
  }

  return [...items].sort((left, right) => left.productId.localeCompare(right.productId));
};

/**
 * Проверяет свободный остаток по уже заблокированным строкам.
 *
 * Строки, которой нет, означает ноль: товар в этот офис ни разу не приходил.
 */
export const requireOrderStock = (
  officeId: string,
  items: OrderItemRequest[],
  stock: StockRow[],
): void => {
  const onHandByProduct = new Map(stock.map((row) => [row.productId, row.onHand]));

  for (const item of items) {
    const available = onHandByProduct.get(item.productId) ?? 0;

    if (available < item.quantity) {
      throw new InsufficientStockError(officeId, item.productId, item.quantity, available);
    }
  }
};
