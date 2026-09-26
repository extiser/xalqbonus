import { readCampaignWindow, type CampaignWindowRequestFields } from '#server/services/campaigns/fields';
import { setCampaignSecondHalf } from '#server/services/campaigns/setCampaignSecondHalf';
import { rethrowCampaignFailure } from '#server/utils/campaignFailure';
import { requireDemoEditor, requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { CAMPAIGN_ROLES } from '#shared/access';
import type { CampaignResponse } from '#shared/types/campaign';

// Окно половины Б идущей акции — две даты, один раз. Без деления и после назначения — `409`.
export default defineEventHandler(async (event): Promise<CampaignResponse> => {
  const employee = await requireEmployeeRole(event, CAMPAIGN_ROLES);

  const campaignId = requireUuidParam(event, 'campaignId');

  await requireDemoEditor(employee, { kind: 'campaign', id: campaignId });

  try {
    const window = readCampaignWindow(await readBody<CampaignWindowRequestFields | null>(event));

    return await setCampaignSecondHalf(campaignId, window);
  } catch (error) {
    return rethrowCampaignFailure(error);
  }
});
