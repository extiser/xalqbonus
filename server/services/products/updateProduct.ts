import { updateProductFields } from '#server/repositories/products';
import { UnknownProductError } from '#server/services/products/errors';
import { assertPrices, toProduct, type ProductFields } from '#server/services/products/fields';
import type { Product } from '#shared/types/catalog';

/**
 * Правка товара.
 *
 * Цена меняется здесь свободно и прошлые заказы не трогает: позиция заказа помнит свою
 * цену копией (`order_items.unit_points`), и переоценка товара не переписывает историю
 * (docs/decisions.md → «Позиция помнит цену»).
 *
 * Фото и отметка архива этой правкой не двигаются: у обоих своё действие.
 */
export const updateProduct = async (
  productId: string,
  fields: ProductFields,
): Promise<Product> => {
  assertPrices(fields);

  const row = await updateProductFields(productId, fields);

  if (!row) {
    throw new UnknownProductError(productId);
  }

  return toProduct(row);
};
