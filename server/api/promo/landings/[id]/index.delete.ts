// Ручки лендингов берут функции `h3` явно, а не автоимпортом: тест доступа зовёт их напрямую,
// а в тесте автоимпортов Nitro нет.
import { defineEventHandler } from 'h3';

import { deleteLanding } from '#server/services/promo/deleteLanding';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { rejectPromoFailure } from '#server/utils/promoFailure';
import { requireUuidParam } from '#server/utils/query';
import { PROMO_ROLES } from '#shared/access';

// Удаление лендинга без меток (issue #478); стоит у меток — `409 landing_in_use`.
export default defineEventHandler(async (event): Promise<{ id: string }> => {
  await requireEmployeeRole(event, PROMO_ROLES);

  const landingId = requireUuidParam(event, 'id');

  try {
    await deleteLanding(landingId);
  } catch (error) {
    throw rejectPromoFailure(error);
  }

  return { id: landingId };
});
