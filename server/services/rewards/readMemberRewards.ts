import type { Language } from '#server/generated/prisma/enums';
import { listPersonRewards } from '#server/repositories/rewards';
import { describeMemberReward } from '#server/services/rewards/memberRewardScreen';
import type { MiniAppRewardsResponse } from '#shared/types/rewards';

/**
 * Награды водителя для раздела «Мои награды»: ждущие первыми, дальше по последнему событию,
 * баллы наравне с товарами.
 * Раздел отвечает на вопрос «что мне дали», история начислений — «что с балансом».
 */

/**
 * Сколько наград показывается. Листания нет по тому же доводу, что у заказов: за неделю
 * акции у водителя их около десятка, и потолок стоит, чтобы ответ не рос без предела.
 */
const REWARDS_LIMIT = 100;

export type MemberRewardsRequest = {
  personId: string;
  language: Language;
};

export const readMemberRewards = async (
  request: MemberRewardsRequest,
): Promise<MiniAppRewardsResponse> => {
  const rows = await listPersonRewards(request.personId, REWARDS_LIMIT);

  return { rewards: rows.map((row) => describeMemberReward(row, request.language)) };
};
