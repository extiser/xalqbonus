import { consola } from 'consola';
import { updateProductArchived } from '#server/repositories/products';
import { UnknownProductError } from '#server/services/products/errors';
import { toProduct } from '#server/services/products/fields';
import type { Product } from '#shared/types/catalog';

/**
 * Архивирование товара и возврат из архива.
 *
 * Удаления нет и не будет: на товар ссылаются позиции заказов, и позиция обязана помнить,
 * что именно было заказано (docs/decisions.md → «Позиция помнит цену»). Архивный товар
 * исчезает из витрины водителя, но остаётся в истории и в таблице остатков — на полке
 * он может ещё лежать.
 */
const log = consola.withTag('products:archive');

export const setProductArchived = async (
  productId: string,
  archived: boolean,
): Promise<Product> => {
  const row = await updateProductArchived(productId, archived);

  if (!row) {
    throw new UnknownProductError(productId);
  }

  log.info(archived ? 'товар в архиве' : 'товар вернулся из архива', { productId });

  return toProduct(row);
};
