import { InvalidProductPriceError, UnknownProductError } from '#server/services/products/errors';
import { readProductFields, type ProductRequestFields } from '#server/services/products/fields';
import { updateProduct } from '#server/services/products/updateProduct';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { CATALOG_ROLES } from '#shared/access';
import type { ProductResponse } from '#shared/types/catalog';

// Правка товара. Цена меняется свободно и прошлых заказов не трогает: позиция заказа помнит
// свою цену копией (docs/decisions.md → «Позиция помнит цену»).
//
// Фото и архивность этим запросом не меняются — у обоих своя ручка.
export default defineEventHandler(async (event): Promise<ProductResponse> => {
  await requireEmployeeRole(event, CATALOG_ROLES);

  const productId = requireUuidParam(event, 'productId');
  const fields = readProductFields(await readBody<ProductRequestFields>(event));

  if (!fields) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'нужны название и все три цены',
    });
  }

  try {
    return { product: await updateProduct(productId, fields) };
  } catch (error) {
    if (error instanceof InvalidProductPriceError) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Bad Request',
        message: error.message,
      });
    }

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
