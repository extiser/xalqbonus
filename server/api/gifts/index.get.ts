import { readGiftGrants } from '#server/services/gifts/readGiftGrants';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { REWARD_GRANT_ROLES } from '#shared/access';
import type { GiftGrantsResponse } from '#shared/types/rewards';

// Раздачи подарков свежими вперёд (issue #219) — тем, кому открыт раздел «Награды». Раздачи
// сегментам видит и менеджер: смотреть — не раздавать.
export default defineEventHandler(async (event): Promise<GiftGrantsResponse> => {
  await requireEmployeeRole(event, REWARD_GRANT_ROLES);

  return readGiftGrants();
});
