// Ручки лендингов берут функции `h3` явно, а не автоимпортом: тест доступа зовёт их напрямую,
// а в тесте автоимпортов Nitro нет.
import { defineEventHandler } from 'h3';

import { LandingFailure } from '#server/services/promo/landingFailure';
import { readLandingCard } from '#server/services/promo/readLandingCard';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { rejectPromoFailure } from '#server/utils/promoFailure';
import { requireUuidParam } from '#server/utils/query';
import { PROMO_ROLES } from '#shared/access';
import type { LandingCard } from '#shared/types/landings';

// Предпросмотр лендинга (issue #478): метки на нём, последняя версия с проверкой и действующая.
export default defineEventHandler(async (event): Promise<LandingCard> => {
  await requireEmployeeRole(event, PROMO_ROLES);

  const landingId = requireUuidParam(event, 'id');

  try {
    const card = await readLandingCard(landingId);

    if (card === null) throw new LandingFailure('landing_not_found');

    return card;
  } catch (error) {
    throw rejectPromoFailure(error);
  }
});
