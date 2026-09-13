import { readOfficeList } from '#server/services/offices/readOfficeList';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { CATALOG_ROLES } from '#shared/access';
import type { OfficeListResponse } from '#shared/types/catalog';

// Список офисов парка. Открыт владельцу и админу: цены, приход и состав офисов — их работа,
// а менеджер стоит в офисе и выдаёт заказы (issue #120).
//
// Роль сверяется со списком из `shared/access.ts` — тем же, по которому шапка прячет пункт.
// Решает эта проверка, а не шапка.
export default defineEventHandler(async (event): Promise<OfficeListResponse> => {
  await requireEmployeeRole(event, CATALOG_ROLES);

  return readOfficeList();
});
