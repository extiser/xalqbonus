// Ручки лендингов берут функции `h3` явно, а не автоимпортом: тест доступа зовёт их напрямую,
// а в тесте автоимпортов Nitro нет.
import { defineEventHandler } from 'h3';

import { addLandingVersion } from '#server/services/promo/addLandingVersion';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { readLandingUpload } from '#server/utils/landingUpload';
import { rejectPromoFailure } from '#server/utils/promoFailure';
import { requireUuidParam } from '#server/utils/query';
import { PROMO_ROLES } from '#shared/access';
import type { LandingVersionAdded } from '#shared/types/landings';

// Замена лендинга новой версией (issue #478): поле `file`, название не меняется.
export default defineEventHandler(async (event): Promise<LandingVersionAdded> => {
  const employee = await requireEmployeeRole(event, PROMO_ROLES);
  const landingId = requireUuidParam(event, 'id');
  const { archive } = await readLandingUpload(event);

  try {
    return await addLandingVersion({ landingId, archive, employeeId: employee.employeeId });
  } catch (error) {
    throw rejectPromoFailure(error);
  }
});
