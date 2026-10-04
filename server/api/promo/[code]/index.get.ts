import { readPromoCard } from '#server/services/promo/readPromoCard';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { promoNotFound, readPromoCodeParam, rejectPromoFailure } from '#server/utils/promoFailure';
import { PROMO_ROLES } from '#shared/access';
import type { PromoCard } from '#shared/types/promo';

// Карточка промо-метки (issue #380): ссылка, воронка, переходы по дням, вступившие.
export default defineEventHandler(async (event): Promise<PromoCard> => {
  await requireEmployeeRole(event, PROMO_ROLES);

  let card: PromoCard | null;

  try {
    card = await readPromoCard(readPromoCodeParam(getRouterParam(event, 'code')));
  } catch (error) {
    throw rejectPromoFailure(error);
  }

  if (card === null) {
    throw promoNotFound();
  }

  return card;
});
