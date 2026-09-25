import { readLatestProducts } from '#server/services/products/readLatestProducts';
import { requireMember } from '#server/utils/miniAppMember';
import type { MiniAppLatestProductsResponse } from '#shared/types/miniapp';

// Блок каталога на главной: самые свежие товары, которые можно взять хотя бы в одном офисе.
export default defineEventHandler(async (event): Promise<MiniAppLatestProductsResponse> => {
  await requireMember(event);

  return readLatestProducts();
});
