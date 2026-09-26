import { setProductArchived } from '#server/services/products/setProductArchived';
import { requireDemoEditor, requireEmployeeRole } from '#server/utils/employeeAuth';
import { rethrowProductFailure } from '#server/utils/productFailure';
import { requireUuidParam } from '#server/utils/query';
import { CATALOG_ROLES } from '#shared/access';
import type { ProductResponse } from '#shared/types/catalog';

// Архивирование товара. Удаления у опубликованного нет: на товар ссылаются позиции заказов,
// и позиция обязана помнить, что именно было заказано (docs/decisions.md → «Позиция помнит
// цену»). Черновик отвечает `409`: его удаляют, а не архивируют.
export default defineEventHandler(async (event): Promise<ProductResponse> => {
  const employee = await requireEmployeeRole(event, CATALOG_ROLES);

  const productId = requireUuidParam(event, 'productId');

  await requireDemoEditor(employee, { kind: 'product', id: productId });

  try {
    return { product: await setProductArchived(productId, true) };
  } catch (error) {
    return rethrowProductFailure(error);
  }
});
