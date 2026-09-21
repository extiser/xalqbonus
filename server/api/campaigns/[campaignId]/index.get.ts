import { readCampaign } from '#server/services/campaigns/readCampaign';
import { rethrowCampaignFailure } from '#server/utils/campaignFailure';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { CAMPAIGN_ROLES } from '#shared/access';
import type { CampaignResponse } from '#shared/types/campaign';

// Карточка акции: акция, окна половин и разбивка состава по состояниям.
export default defineEventHandler(async (event): Promise<CampaignResponse> => {
  await requireEmployeeRole(event, CAMPAIGN_ROLES);

  const campaignId = requireUuidParam(event, 'campaignId');

  try {
    return await readCampaign(campaignId);
  } catch (error) {
    return rethrowCampaignFailure(error);
  }
});
