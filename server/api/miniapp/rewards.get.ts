import { readMemberRewards } from '#server/services/rewards/readMemberRewards';
import { requireMember } from '#server/utils/miniAppMember';
import type { MiniAppRewardsResponse } from '#shared/types/rewards';

/**
 * Награды того, кто открыл приложение: свежие первыми (issue #172).
 *
 * Идентификатора человека в запросе нет и быть не может — ровно как в `history` и `me`:
 * чьи это награды, решает проверенная `initData` и привязка в базе, а не строка от клиента
 * (docs/miniapp.md → «Личность приходит от мессенджера»).
 */
export default defineEventHandler(async (event): Promise<MiniAppRewardsResponse> => {
  const driver = await requireMember(event);

  return readMemberRewards({ personId: driver.personId, language: driver.language });
});
