import { claimGift } from '#server/services/gifts/creditGift';
import { denyMemberGift, giftDenialCode } from '#server/utils/memberGiftDenial';
import { requireMember } from '#server/utils/miniAppMember';
import { readUuid } from '#server/utils/query';
import type { MiniAppGiftClaimResponse } from '#shared/types/rewards';

/**
 * «Забрать» подарок от Xalq Taxi (issue #219): баллы ложатся на баланс, ответ — баланс после
 * зачисления. Чей подарок — решает подпись: человек из `initData`, а не из запроса.
 *
 * «Забрать всё» своей ручки не имеет: экран зовёт эту по каждому подарку, и у каждого свой
 * исход (решение Руслана 24-09-2026).
 *
 * Испорченный идентификатор отвечает тем же `gift_not_found`, что и чужой: экран решает
 * по коду, и отличать «такого нет» от «ссылка испорчена» ему нечем и незачем.
 */
export default defineEventHandler(async (event): Promise<MiniAppGiftClaimResponse> => {
  const driver = await requireMember(event);
  const rewardId = readUuid(getRouterParam(event, 'rewardId'));

  if (!rewardId) {
    throw denyMemberGift('gift_not_found', driver.language);
  }

  try {
    const { balance } = await claimGift(rewardId, driver.personId);

    return { balancePoints: Number(balance) };
  } catch (error) {
    const code = giftDenialCode(error);

    if (code) {
      throw denyMemberGift(code, driver.language);
    }

    throw error;
  }
});
