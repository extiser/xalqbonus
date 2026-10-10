import { createPromoLink } from '#server/services/promo/createPromoLink';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { rejectPromoFailure } from '#server/utils/promoFailure';
import { PROMO_ROLES } from '#shared/access';
import type { PromoCreated } from '#shared/types/promo';

// Заведение промо-метки (issue #380). Годятся ли поля и свободен ли код, решает сервис;
// отказ — кодом и текстом по полю формы.
type CreateBody = {
  code?: unknown;
  name?: unknown;
  medium?: unknown;
  entry?: unknown;
  placement?: unknown;
};

export default defineEventHandler(async (event): Promise<PromoCreated> => {
  const employee = await requireEmployeeRole(event, PROMO_ROLES);
  const body = await readBody<CreateBody | null>(event);

  try {
    return await createPromoLink({
      code: body?.code,
      name: body?.name,
      medium: body?.medium,
      entry: body?.entry,
      placement: body?.placement,
      employeeId: employee.employeeId,
    });
  } catch (error) {
    throw rejectPromoFailure(error);
  }
});
