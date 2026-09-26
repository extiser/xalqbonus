import { readProductFields, type ProductRequestFields } from '#server/services/products/fields';
import { updateProduct } from '#server/services/products/updateProduct';
import { requireDemoEditor, requireEmployeeRole } from '#server/utils/employeeAuth';
import { rethrowProductFailure } from '#server/utils/productFailure';
import { requireUuidParam } from '#server/utils/query';
import { CATALOG_ROLES } from '#shared/access';
import type { ProductResponse } from '#shared/types/catalog';

// Правка товара. Черновик — любыми полями, им сохраняет себя форма; опубликованный — только
// целиком, иначе `409` со всеми недостающими полями. Цена меняется свободно и прошлых заказов
// не трогает: позиция заказа помнит свою цену копией (docs/decisions.md → «Позиция помнит цену»).
//
// Фото, публикация и архивность этим запросом не меняются — у каждого своя ручка.
export default defineEventHandler(async (event): Promise<ProductResponse> => {
  const employee = await requireEmployeeRole(event, CATALOG_ROLES);

  const productId = requireUuidParam(event, 'productId');

  await requireDemoEditor(employee, { kind: 'product', id: productId });

  const fields = readProductFields(await readBody<ProductRequestFields | null>(event));

  try {
    return { product: await updateProduct(productId, fields) };
  } catch (error) {
    return rethrowProductFailure(error);
  }
});
