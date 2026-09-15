import { consola } from 'consola';
import { findProduct, markProductPublished } from '#server/repositories/products';
import { ProductIncompleteError, UnknownProductError } from '#server/services/products/errors';
import { toProduct } from '#server/services/products/fields';
import { CHECK_VIOLATION, isConstraintViolation } from '#server/utils/postgresErrors';
import { productPublishProblems } from '#shared/product';
import type { Product } from '#shared/types/catalog';

/**
 * Публикация черновика: после неё товар живёт как любой другой — виден на витрине, если лежит
 * в офисе, принимает приход, архивируется (issue #148).
 *
 * Обязательные поля проверяются здесь, а не при сохранении — тем же приёмом, что у рассылки,
 * где предел длины стал условием запуска. Причины называются все сразу, тем же списком, что
 * экран показывает у закрытой кнопки (`shared/product.ts`).
 *
 * Проверяется сохранённое: экран досохраняет набранное перед нажатием. Правку, пришедшую
 * между чтением и записью, отбивает `products_published_complete_check`.
 *
 * Повтор у опубликованного — не отказ: отвечает товаром, отметку публикации не двигает.
 */
const log = consola.withTag('products:publish');

export const publishProduct = async (productId: string): Promise<Product> => {
  const current = await findProduct(productId);

  if (!current) {
    throw new UnknownProductError(productId);
  }

  const problems = productPublishProblems(current);

  if (problems.length > 0) {
    throw new ProductIncompleteError(productId, problems);
  }

  let row;

  try {
    row = await markProductPublished(productId);
  } catch (error) {
    if (isConstraintViolation(error, CHECK_VIOLATION, 'products_published_complete_check')) {
      const after = await findProduct(productId);

      throw new ProductIncompleteError(productId, after ? productPublishProblems(after) : problems);
    }

    throw error;
  }

  if (!row) {
    throw new UnknownProductError(productId);
  }

  if (current.publishedAt === null) {
    log.info('товар опубликован', { productId, name: row.name });
  }

  return toProduct(row);
};
