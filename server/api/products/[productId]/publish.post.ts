import { publishProduct } from '#server/services/products/publishProduct';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { rethrowProductFailure } from '#server/utils/productFailure';
import { requireUuidParam } from '#server/utils/query';
import { CATALOG_ROLES } from '#shared/access';
import type { ProductResponse } from '#shared/types/catalog';

// Публикация черновика. Неполный отвечает `409` со всеми недостающими полями сразу, повтор
// у опубликованного — товаром.
export default defineEventHandler(async (event): Promise<ProductResponse> => {
  await requireEmployeeRole(event, CATALOG_ROLES);

  const productId = requireUuidParam(event, 'productId');

  try {
    return { product: await publishProduct(productId) };
  } catch (error) {
    return rethrowProductFailure(error);
  }
});
