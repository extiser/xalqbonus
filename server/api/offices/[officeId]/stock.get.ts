import { readOfficeStock } from '#server/services/stock/readOfficeStock';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { CATALOG_ROLES } from '#shared/access';
import type { OfficeStockResponse } from '#shared/types/catalog';

// Таблица остатков офиса: весь каталог с `on_hand` и `reserved`. Товар, которого в офисе
// ещё не было, показан нулями — иначе его нечем было бы выбрать для прихода.
export default defineEventHandler(async (event): Promise<OfficeStockResponse> => {
  await requireEmployeeRole(event, CATALOG_ROLES);

  const officeId = requireUuidParam(event, 'officeId');
  const stock = await readOfficeStock(officeId);

  if (!stock) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: 'офиса с таким идентификатором нет',
    });
  }

  return stock;
});
