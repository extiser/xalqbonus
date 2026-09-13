import { UnknownProductError } from '#server/services/products/errors';
import { setProductArchived } from '#server/services/products/setProductArchived';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { CATALOG_ROLES } from '#shared/access';
import type { ProductResponse } from '#shared/types/catalog';

// Возврат товара из архива — своей ручкой, как и у офиса.
export default defineEventHandler(async (event): Promise<ProductResponse> => {
  await requireEmployeeRole(event, CATALOG_ROLES);

  const productId = requireUuidParam(event, 'productId');

  try {
    return { product: await setProductArchived(productId, false) };
  } catch (error) {
    if (error instanceof UnknownProductError) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Not Found',
        message: 'товара с таким идентификатором нет',
      });
    }

    throw error;
  }
});
