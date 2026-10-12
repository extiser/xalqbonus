// Ручки лендингов берут функции `h3` явно, а не автоимпортом: тест доступа зовёт их напрямую,
// а в тесте автоимпортов Nitro нет.
import { defineEventHandler } from 'h3';

import { listLandingOptions } from '#server/services/promo/listLandingOptions';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { PROMO_ROLES } from '#shared/access';
import type { LandingOption } from '#shared/types/landings';

// Лендинги для поля «Лендинг» в «Новой метке» и «Изменить» (issue #478).
export default defineEventHandler(async (event): Promise<LandingOption[]> => {
  await requireEmployeeRole(event, PROMO_ROLES);

  return listLandingOptions();
});
