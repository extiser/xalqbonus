import { findProduct, updateProductFields } from '#server/repositories/products';
import { ProductIncompleteError, UnknownProductError } from '#server/services/products/errors';
import { assertPrices, toProduct, type ProductFields } from '#server/services/products/fields';
import { CHECK_VIOLATION, isConstraintViolation } from '#server/utils/postgresErrors';
import { productPublishProblems } from '#shared/product';
import type { Product } from '#shared/types/catalog';

/**
 * Правка товара.
 *
 * Черновик правится каким угодно — им сохраняет себя форма по мере набора (issue #148).
 * Опубликованный обязательных полей правкой не теряет: он уже на витрине, и товар без цены
 * там — поломка. Проверка та же, что у публикации, и все причины называются сразу.
 *
 * Цена меняется здесь свободно и прошлые заказы не трогает: позиция заказа помнит свою
 * цену копией (`order_items.unit_points`), и переоценка товара не переписывает историю
 * (docs/decisions.md → «Позиция помнит цену»).
 *
 * Фото, публикация и отметка архива этой правкой не двигаются: у каждого своё действие.
 */
export const updateProduct = async (
  productId: string,
  fields: ProductFields,
): Promise<Product> => {
  assertPrices(fields);

  const current = await findProduct(productId);

  if (!current) {
    throw new UnknownProductError(productId);
  }

  const problems = productPublishProblems(fields);

  if (current.publishedAt !== null && problems.length > 0) {
    throw new ProductIncompleteError(productId, problems);
  }

  try {
    const row = await updateProductFields(productId, fields);

    if (!row) {
      throw new UnknownProductError(productId);
    }

    return toProduct(row);
  } catch (error) {
    // Опубликовали между чтением выше и записью: неполную правку отбила база.
    if (isConstraintViolation(error, CHECK_VIOLATION, 'products_published_complete_check')) {
      throw new ProductIncompleteError(productId, problems);
    }

    throw error;
  }
};
