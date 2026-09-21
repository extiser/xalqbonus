import { joinCampaign } from '#server/services/campaigns/respondToCampaign';
import { requireMember } from '#server/utils/miniAppMember';
import type { MiniAppCampaignResponse } from '#shared/types/miniapp';

// «Участвовать». Повтор отвечает успехом и ничего не меняет; отказавшемуся не помогает —
// ответ несёт то состояние, что в базе.
export default defineEventHandler(async (event): Promise<MiniAppCampaignResponse> => {
  const driver = await requireMember(event);

  return joinCampaign(driver, new Date());
});
