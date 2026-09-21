import { readMemberCampaign } from '#server/services/campaigns/readMemberCampaign';
import { requireMember } from '#server/utils/miniAppMember';
import type { MiniAppCampaignResponse } from '#shared/types/miniapp';

// Что у водителя с акцией: идёт ли она для него, сроки его окна и его состояние. Первое
// чтение переводит «приглашён» в «открыл». Не участнику акции — `{ campaign: null }`,
// а не отказ: отсутствие акции — обычное состояние.
export default defineEventHandler(async (event): Promise<MiniAppCampaignResponse> => {
  const driver = await requireMember(event);

  return readMemberCampaign(driver, new Date());
});
