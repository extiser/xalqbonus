import { findProduct } from '#server/repositories/products';
import { toProduct } from '#server/services/products/fields';
import type { Product } from '#shared/types/catalog';

/** Один товар. `null` — товара нет; что на это ответить, решает ручка. */
export const readProduct = async (productId: string): Promise<Product | null> => {
  const row = await findProduct(productId);

  return row ? toProduct(row) : null;
};
