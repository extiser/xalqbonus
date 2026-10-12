// Ручки лендингов берут функции `h3` явно, а не автоимпортом: тест доступа зовёт их напрямую,
// а в тесте автоимпортов Nitro нет.
import { defineEventHandler } from 'h3';

import { inspectLandingArchive } from '#server/services/promo/inspectLandingArchive';
import { LandingFailure } from '#server/services/promo/landingFailure';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { readLandingUpload } from '#server/utils/landingUpload';
import { rejectPromoFailure } from '#server/utils/promoFailure';
import { PROMO_ROLES } from '#shared/access';
import type { LandingCheckResult } from '#shared/types/landings';

// Проверка архива без записи (issue #478): окно загрузки зовёт её сразу после выбора файла.
export default defineEventHandler(async (event): Promise<LandingCheckResult> => {
  await requireEmployeeRole(event, PROMO_ROLES);

  const { archive } = await readLandingUpload(event);

  try {
    if (archive === null) throw new LandingFailure('landing_archive_invalid');

    const { checks, passed } = inspectLandingArchive(archive);

    return { checks, passed };
  } catch (error) {
    throw rejectPromoFailure(error);
  }
});
