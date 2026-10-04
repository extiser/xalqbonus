import { listPromoLinks } from '#server/services/promo/listPromoLinks';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { PROMO_ROLES } from '#shared/access';
import type { PromoList } from '#shared/types/promo';

// Список промо-меток с воронкой и итоги по всем меткам (issue #380).
export default defineEventHandler(async (event): Promise<PromoList> => {
  await requireEmployeeRole(event, PROMO_ROLES);

  return listPromoLinks();
});
