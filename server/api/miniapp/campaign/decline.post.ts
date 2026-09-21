import { declineCampaign } from '#server/services/campaigns/respondToCampaign';
import { requireMember } from '#server/utils/miniAppMember';
import type { MiniAppCampaignResponse } from '#shared/types/miniapp';

// «Отказаться». Повтор отвечает успехом и ничего не меняет; вступившему не помогает —
// назад состояния не ходят.
export default defineEventHandler(async (event): Promise<MiniAppCampaignResponse> => {
  const driver = await requireMember(event);

  return declineCampaign(driver, new Date());
});
