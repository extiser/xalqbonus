import { readRewardGrantOptions } from '#server/services/rewards/readRewardGrantOptions';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { REWARD_GRANT_ROLES } from '#shared/access';
import type { RewardGrantOptionsResponse } from '#shared/types/rewards';

// Офисы и товары для формы ручной выдачи награды — тем, кому выдача открыта. `?demo=true` —
// сторона демо-водителя и демо-акции: только демо-офисы, товары живые и демо (issue #212).
export default defineEventHandler(async (event): Promise<RewardGrantOptionsResponse> => {
  await requireEmployeeRole(event, REWARD_GRANT_ROLES);

  return readRewardGrantOptions({ isDemo: getQuery(event).demo === 'true' });
});
