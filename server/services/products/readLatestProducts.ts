import { listLatestProducts } from '#server/repositories/stock';
import type { MiniAppLatestProductsResponse } from '#shared/types/miniapp';

/**
 * Товары блока каталога на главной: четыре самых свежих из тех, что можно взять хотя бы
 * в одном офисе (решение Руслана 25-09-2026, issue #218).
 *
 * Четыре, а не шесть: блок — часть каталога, а не весь каталог на всю прокрутку
 * (`_reference/design/catalog/catalog-block.md`).
 */
const LATEST_PRODUCTS_LIMIT = 4;

export type LatestProductsRequest = {
  /** Водитель демо: ему видны демо-товары и остаток ДЕМО ОФИСА (issue #212). */
  isDemo: boolean;
};

export const readLatestProducts = async (
  request: LatestProductsRequest,
): Promise<MiniAppLatestProductsResponse> => {
  const rows = await listLatestProducts(LATEST_PRODUCTS_LIMIT, request.isDemo);

  return {
    products: rows.map((row) => ({
      productId: row.productId,
      name: row.name,
      photoPath: row.photoPath,
      updatedAt: row.updatedAt.toISOString(),
      pricePoints: row.pricePoints,
    })),
  };
};
