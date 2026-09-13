import {
  DEFAULT_MOVEMENTS_LIMIT,
  readStockMovementsPage,
} from '#server/services/stock/readStockMovementsPage';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { readPositiveInteger, requireUuidParam } from '#server/utils/query';
import { CATALOG_ROLES } from '#shared/access';
import type { StockMovementsResponse } from '#shared/types/catalog';

// Журнал движений офиса: истина по остатку, а `office_stock` — его кэш. Читают его тогда,
// когда спрашивают «почему остаток такой».
//
// Существование офиса здесь не проверяется отдельным запросом: пустой журнал у офиса,
// которого нет, и у офиса без движений выглядит одинаково, а страница журнала открывается
// только с карточки офиса — она и отвечает `404`.
export default defineEventHandler(async (event): Promise<StockMovementsResponse> => {
  await requireEmployeeRole(event, CATALOG_ROLES);

  const officeId = requireUuidParam(event, 'officeId');
  const query = getQuery(event);

  return readStockMovementsPage(
    officeId,
    readPositiveInteger(query.limit, DEFAULT_MOVEMENTS_LIMIT),
    readPositiveInteger(query.offset, 0),
  );
});
