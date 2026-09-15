import { consola } from 'consola';
import { insertProductDraft } from '#server/repositories/products';
import { assertPrices, toProduct, type ProductFields } from '#server/services/products/fields';
import type { Product } from '#shared/types/catalog';

/**
 * Заведение товара — всегда черновиком.
 *
 * Заводит его форма первым набранным символом или выбранным файлом (issue #148), поэтому
 * поля могут быть пустыми все: название и цены — условие публикации, а не заведения.
 * Черновик водителю не виден нигде, пока его не опубликуют.
 *
 * Без фото: фото приезжает своим запросом, потому что это файл, а не поле формы, — уже
 * к заведённому черновику и на том же экране.
 */
const log = consola.withTag('products:create');

export const createProduct = async (fields: ProductFields): Promise<Product> => {
  assertPrices(fields);

  const row = await insertProductDraft(fields);

  log.info('черновик товара заведён', { productId: row.id, name: row.name });

  return toProduct(row);
};
