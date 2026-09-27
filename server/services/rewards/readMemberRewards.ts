import type { Language } from '#server/generated/prisma/enums';
import { listPersonClaimableGifts } from '#server/repositories/gifts';
import { listPersonRewards, listPersonSheetRewards } from '#server/repositories/rewards';
import {
  describeMemberGift,
  describeMemberReward,
  describeSheetReward,
} from '#server/services/rewards/memberRewardScreen';
import type { MiniAppRewardsResponse } from '#shared/types/rewards';

/**
 * Награды водителя для раздела «Мои награды»: ждущие первыми, дальше по последнему событию,
 * баллы наравне с товарами.
 * Раздел отвечает на вопрос «что мне дали», история начислений — «что с балансом».
 *
 * Ждущие подарки от Xalq Taxi — отдельным списком (issue #219): у них своя карточка
 * с «Забрать», а в общий список подарок попадает, когда лёг на баланс.
 *
 * Ручные награды, которых водитель не видел в шторке, — ещё одним списком (issue #266):
 * шторка подарков показывает их под подарками. В общем списке они есть и так.
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
  const [rows, gifts, sheetRewards] = await Promise.all([
    listPersonRewards(request.personId, REWARDS_LIMIT),
    listPersonClaimableGifts(request.personId),
    listPersonSheetRewards(request.personId),
  ]);

  return {
    rewards: rows.map((row) => describeMemberReward(row, request.language)),
    gifts: gifts.map((gift) => describeMemberGift(gift, request.language)),
    giftsUnseen: gifts.some((gift) => gift.shownAt === null),
    sheetRewards: sheetRewards.map((reward) => describeSheetReward(reward, request.language)),
  };
};
