import { readProduct } from '#server/services/products/readProduct';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { CATALOG_ROLES } from '#shared/access';
import type { ProductResponse } from '#shared/types/catalog';

// Один товар — под форму правки.
export default defineEventHandler(async (event): Promise<ProductResponse> => {
  await requireEmployeeRole(event, CATALOG_ROLES);

  const product = await readProduct(requireUuidParam(event, 'productId'));

  if (!product) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: 'товара с таким идентификатором нет',
    });
  }

  return { product };
});
