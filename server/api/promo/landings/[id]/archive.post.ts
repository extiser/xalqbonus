// Ручки лендингов берут функции `h3` явно, а не автоимпортом: тест доступа зовёт их напрямую,
// а в тесте автоимпортов Nitro нет.
import { defineEventHandler } from 'h3';

import { setLandingArchived } from '#server/services/promo/setLandingArchived';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { rejectPromoFailure } from '#server/utils/promoFailure';
import { requireUuidParam } from '#server/utils/query';
import { PROMO_ROLES } from '#shared/access';
import type { LandingArchived } from '#shared/types/landings';

// «В архив» у лендинга (issue #478).
export default defineEventHandler(async (event): Promise<LandingArchived> => {
  await requireEmployeeRole(event, PROMO_ROLES);

  const landingId = requireUuidParam(event, 'id');

  try {
    return await setLandingArchived(landingId, true);
  } catch (error) {
    throw rejectPromoFailure(error);
  }
});
