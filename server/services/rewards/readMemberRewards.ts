import type { Language } from '#server/generated/prisma/enums';
import { listPersonClaimableGifts } from '#server/repositories/gifts';
import { listPersonRewards } from '#server/repositories/rewards';
import {
  describeMemberGift,
  describeMemberReward,
} from '#server/services/rewards/memberRewardScreen';
import type { MiniAppRewardsResponse } from '#shared/types/rewards';

/**
 * Награды водителя для раздела «Мои награды»: ждущие первыми, дальше по последнему событию,
 * баллы наравне с товарами.
 * Раздел отвечает на вопрос «что мне дали», история начислений — «что с балансом».
 *
 * Ждущие подарки от Xalq Taxi — отдельным списком (issue #219): у них своя карточка
 * с «Забрать», а в общий список подарок попадает, когда лёг на баланс.
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
  const [rows, gifts] = await Promise.all([
    listPersonRewards(request.personId, REWARDS_LIMIT),
    listPersonClaimableGifts(request.personId),
  ]);

  return {
    rewards: rows.map((row) => describeMemberReward(row, request.language)),
    gifts: gifts.map((gift) => describeMemberGift(gift, request.language)),
    giftsUnseen: gifts.some((gift) => gift.shownAt === null),
  };
};
