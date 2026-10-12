import { updatePromoLink } from '#server/services/promo/updatePromoLink';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { promoNotFound, readPromoCodeParam, rejectPromoFailure } from '#server/utils/promoFailure';
import { PROMO_ROLES } from '#shared/access';

// Правка метки — «Изменить» в карточке (issue #380): название, место и лендинг (issue #478). Код,
// носитель и вход не меняются; поля в теле, кроме этих трёх, не читаются.
type UpdateBody = {
  name?: unknown;
  placement?: unknown;
  landingId?: unknown;
};

export default defineEventHandler(async (event): Promise<{ code: string }> => {
  await requireEmployeeRole(event, PROMO_ROLES);

  const code = readPromoCodeParam(getRouterParam(event, 'code'));
  const body = await readBody<UpdateBody | null>(event);
  let updated: boolean;

  try {
    updated = await updatePromoLink(code, {
      name: body?.name,
      placement: body?.placement,
      landingId: body?.landingId,
    });
  } catch (error) {
    throw rejectPromoFailure(error);
  }

  if (!updated) {
    throw promoNotFound();
  }

  return { code };
});
