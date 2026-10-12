// Ручки лендингов берут функции `h3` явно, а не автоимпортом: тест доступа зовёт их напрямую,
// а в тесте автоимпортов Nitro нет.
import { defineEventHandler } from 'h3';

import { listLandings } from '#server/services/promo/listLandings';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { PROMO_ROLES } from '#shared/access';
import type { LandingList } from '#shared/types/landings';

// Вкладка «Лендинги» (issue #478): загруженные лендинги и экран заявки по умолчанию.
export default defineEventHandler(async (event): Promise<LandingList> => {
  await requireEmployeeRole(event, PROMO_ROLES);

  return listLandings();
});
