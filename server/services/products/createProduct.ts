import { consola } from 'consola';
import { insertProduct } from '#server/repositories/products';
import { assertPrices, toProduct, type ProductFields } from '#server/services/products/fields';
import type { Product } from '#shared/types/catalog';

/**
 * Заведение товара.
 *
 * Без фото: фото приезжает своим запросом, потому что это файл, а не поле формы, — и товар
 * обязан заводиться без него. Картинка появляется позже, а до неё товар уже виден в списке
 * и уже принимает приход.
 */
const log = consola.withTag('products:create');

export const createProduct = async (fields: ProductFields): Promise<Product> => {
  assertPrices(fields);

  const row = await insertProduct(fields);

  log.info('товар заведён', { productId: row.id, name: row.name });

  return toProduct(row);
};
