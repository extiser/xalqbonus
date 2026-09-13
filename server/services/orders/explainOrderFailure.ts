import { findProduct } from '#server/repositories/products';
import {
  InsufficientStockError,
  OfficeUnavailableError,
  OrderNotPendingError,
  ProductUnavailableError,
  UnknownOrderError,
} from '#server/services/orders/errors';
import { InsufficientPointsError } from '#server/services/points/errors';

/**
 * Что сказать водителю об отказе оформления или отмены.
 *
 * Код не придумывается — он называет доменную ошибку ядра, одну на код. Всё, чего здесь
 * нет, отказом водителю не является: пустой заказ или дубль позиции означают испорченный
 * запрос, а не то, чего водителю не хватило, и решает о них вызывающий.
 *
 * Название товара дочитывается здесь: ошибка остатка несёт идентификатор, а водителю нужно
 * знать, какого товара не хватило, — «кто-то успел забрать последний» без имени
 * не отличить от поломки.
 */

export type MemberOrderDenial =
  | { code: 'office_unavailable' }
  | { code: 'product_unavailable' }
  | { code: 'insufficient_stock'; productName: string; available: number }
  | { code: 'insufficient_points' }
  | { code: 'order_not_found' }
  | { code: 'order_not_pending' };

export const explainOrderFailure = async (error: unknown): Promise<MemberOrderDenial | null> => {
  if (error instanceof OfficeUnavailableError) {
    return { code: 'office_unavailable' };
  }

  if (error instanceof ProductUnavailableError) {
    return { code: 'product_unavailable' };
  }

  if (error instanceof InsufficientStockError) {
    const product = await findProduct(error.productId);

    return {
      code: 'insufficient_stock',
      productName: product?.name ?? '',
      available: error.available,
    };
  }

  if (error instanceof InsufficientPointsError) {
    return { code: 'insufficient_points' };
  }

  if (error instanceof UnknownOrderError) {
    return { code: 'order_not_found' };
  }

  if (error instanceof OrderNotPendingError) {
    return { code: 'order_not_pending' };
  }

  return null;
};
