import { deleteProductDraft } from '#server/services/products/deleteProductDraft';
import { requireDemoEditor, requireEmployeeRole } from '#server/utils/employeeAuth';
import { rethrowProductFailure } from '#server/utils/productFailure';
import { requireUuidParam } from '#server/utils/query';
import { CATALOG_ROLES } from '#shared/access';

// Удаление черновика товара вместе с фото. Опубликованный отвечает `409`: он архивируется.
// Удалённому отвечать нечем — ответ пустой, `204`.
export default defineEventHandler(async (event): Promise<null> => {
  const employee = await requireEmployeeRole(event, CATALOG_ROLES);

  const productId = requireUuidParam(event, 'productId');

  await requireDemoEditor(employee, { kind: 'product', id: productId });

  try {
    await deleteProductDraft(productId);
  } catch (error) {
    return rethrowProductFailure(error);
  }

  setResponseStatus(event, 204);

  return null;
});
