// Ручки лендингов берут функции `h3` явно, а не автоимпортом: тест доступа зовёт их напрямую,
// а в тесте автоимпортов Nitro нет.
import { defineEventHandler } from 'h3';

import { createLanding } from '#server/services/promo/createLanding';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { readLandingUpload } from '#server/utils/landingUpload';
import { rejectPromoFailure } from '#server/utils/promoFailure';
import { PROMO_ROLES } from '#shared/access';
import type { LandingCreated } from '#shared/types/landings';

// Загрузка лендинга (issue #478): название и архив. Не прошедший проверку тоже сохраняется.
export default defineEventHandler(async (event): Promise<LandingCreated> => {
  const employee = await requireEmployeeRole(event, PROMO_ROLES);
  const upload = await readLandingUpload(event);

  try {
    return await createLanding({ name: upload.name, archive: upload.archive, employeeId: employee.employeeId });
  } catch (error) {
    throw rejectPromoFailure(error);
  }
});
