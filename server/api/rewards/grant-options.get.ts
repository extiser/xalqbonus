import { readRewardGrantOptions } from '#server/services/rewards/readRewardGrantOptions';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { REWARD_GRANT_ROLES } from '#shared/access';
import type { RewardGrantOptionsResponse } from '#shared/types/rewards';

// Офисы и товары для формы ручной выдачи награды — тем, кому выдача открыта.
export default defineEventHandler(async (event): Promise<RewardGrantOptionsResponse> => {
  await requireEmployeeRole(event, REWARD_GRANT_ROLES);

  return readRewardGrantOptions();
});
