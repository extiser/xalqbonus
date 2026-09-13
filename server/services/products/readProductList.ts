import { listProducts } from '#server/repositories/products';
import { toProduct } from '#server/services/products/fields';
import type { ProductListResponse } from '#shared/types/catalog';

/**
 * Каталог для экрана «Каталог» — вместе с архивными товарами.
 *
 * Архив помечается, а не прячется: «товара нет в списке» не должно означать «товар
 * в архиве», иначе архивный товар заводят вторым с тем же названием, и в отчёте парку
 * появляются две строки на одну тряпку для кузова.
 */
export const readProductList = async (): Promise<ProductListResponse> => {
  const rows = await listProducts();

  return { products: rows.map(toProduct) };
};
