import { createProduct } from '#server/services/products/createProduct';
import { readProductFields, type ProductRequestFields } from '#server/services/products/fields';
import { requireDemoEditor, requireEmployeeRole } from '#server/utils/employeeAuth';
import { rethrowProductFailure } from '#server/utils/productFailure';
import { CATALOG_ROLES } from '#shared/access';
import type { ProductResponse } from '#shared/types/catalog';

// Заведение товара — черновиком, первым набранным символом формы, поэтому обязательных полей
// нет (issue #148). Без фото: фото — файл и приезжает своим запросом к заведённому черновику.
// Демо-товар заводит только владелец (issue #212).
export default defineEventHandler(async (event): Promise<ProductResponse> => {
  const employee = await requireEmployeeRole(event, CATALOG_ROLES);

  const body = await readBody<ProductRequestFields | null>(event);
  const isDemo = body?.isDemo === true;

  await requireDemoEditor(employee, isDemo);

  const fields = readProductFields(body);

  try {
    return { product: await createProduct(fields, isDemo) };
  } catch (error) {
    return rethrowProductFailure(error);
  }
});
