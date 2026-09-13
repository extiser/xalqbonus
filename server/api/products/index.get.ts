import { readProductList } from '#server/services/products/readProductList';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { CATALOG_ROLES } from '#shared/access';
import type { ProductListResponse } from '#shared/types/catalog';

// Каталог целиком — вместе с архивными товарами: архив помечается, а не прячется.
// Здесь же лежат закупочные цены, и это вторая причина, по которой раздел открыт
// владельцу и админу, а не всем трём ролям.
export default defineEventHandler(async (event): Promise<ProductListResponse> => {
  await requireEmployeeRole(event, CATALOG_ROLES);

  return readProductList();
});
