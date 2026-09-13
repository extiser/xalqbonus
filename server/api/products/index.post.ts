import { createProduct } from '#server/services/products/createProduct';
import { InvalidProductPriceError } from '#server/services/products/errors';
import { readProductFields, type ProductRequestFields } from '#server/services/products/fields';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { CATALOG_ROLES } from '#shared/access';
import type { ProductResponse } from '#shared/types/catalog';

// Заведение товара. Без фото: фото — файл, и приезжает он своим запросом, уже к готовому
// товару. Товар без картинки виден в списке и принимает приход — картинка появляется потом.
export default defineEventHandler(async (event): Promise<ProductResponse> => {
  await requireEmployeeRole(event, CATALOG_ROLES);

  const fields = readProductFields(await readBody<ProductRequestFields>(event));

  if (!fields) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'нужны название и все три цены',
    });
  }

  try {
    return { product: await createProduct(fields) };
  } catch (error) {
    // Негодная цена — разобранный запрос с негодным значением, и сказать о нём надо иначе,
    // чем о запросе без поля вовсе.
    if (error instanceof InvalidProductPriceError) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Bad Request',
        message: error.message,
      });
    }

    throw error;
  }
});
