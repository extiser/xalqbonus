import { readOfficeShowcase } from '#server/services/products/readOfficeShowcase';
import { denyMemberOrder } from '#server/utils/memberOrderDenial';
import { requireMember } from '#server/utils/miniAppMember';
import { requireUuidParam } from '#server/utils/query';
import type { MiniAppShowcaseResponse } from '#shared/types/miniapp';

// Витрина офиса: товары с остатком больше нуля и баланс того, кто смотрит.
//
// Архивный офис отвечает тем же кодом, что и оформление в нём: водитель, открывший
// витрину по старому экрану, узнаёт ровно то, что узнал бы, нажав «Оформить».
export default defineEventHandler(async (event): Promise<MiniAppShowcaseResponse> => {
  const driver = await requireMember(event);
  const officeId = requireUuidParam(event, 'officeId');

  const showcase = await readOfficeShowcase({ officeId, balance: driver.points });

  if (!showcase) {
    throw denyMemberOrder({ code: 'office_unavailable' }, driver.language);
  }

  return showcase;
});
