import { readCampaignPrizes } from '#server/services/campaigns/readCampaignPrizes';
import { rethrowCampaignFailure } from '#server/utils/campaignFailure';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { CAMPAIGN_ROLES } from '#shared/access';
import type { CampaignPrizesResponse } from '#shared/types/campaign';

// Призы сундуков акции по ступеням — тем же ролям, что карточка акции.
export default defineEventHandler(async (event): Promise<CampaignPrizesResponse> => {
  await requireEmployeeRole(event, CAMPAIGN_ROLES);

  const campaignId = requireUuidParam(event, 'campaignId');

  try {
    return await readCampaignPrizes(campaignId);
  } catch (error) {
    return rethrowCampaignFailure(error);
  }
});
