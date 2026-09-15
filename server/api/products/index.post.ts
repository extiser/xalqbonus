import { createProduct } from '#server/services/products/createProduct';
import { readProductFields, type ProductRequestFields } from '#server/services/products/fields';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { rethrowProductFailure } from '#server/utils/productFailure';
import { CATALOG_ROLES } from '#shared/access';
import type { ProductResponse } from '#shared/types/catalog';

// Заведение товара — черновиком, первым набранным символом формы, поэтому обязательных полей
// нет (issue #148). Без фото: фото — файл и приезжает своим запросом к заведённому черновику.
export default defineEventHandler(async (event): Promise<ProductResponse> => {
  await requireEmployeeRole(event, CATALOG_ROLES);

  const fields = readProductFields(await readBody<ProductRequestFields | null>(event));

  try {
    return { product: await createProduct(fields) };
  } catch (error) {
    return rethrowProductFailure(error);
  }
});
