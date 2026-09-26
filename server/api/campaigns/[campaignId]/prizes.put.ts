import {
  readCampaignPrizeFields,
  type CampaignPrizesRequestFields,
} from '#server/services/campaigns/prizeFields';
import { replaceCampaignPrizes } from '#server/services/campaigns/replaceCampaignPrizes';
import { rethrowCampaignFailure } from '#server/utils/campaignFailure';
import { requireDemoEditor, requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { CAMPAIGN_ROLES } from '#shared/access';
import type { CampaignPrizesResponse } from '#shared/types/campaign';

// Замена набора призов целиком. Не черновик отвечает `409`: у идущей акции наполнение
// сундуков не меняется.
export default defineEventHandler(async (event): Promise<CampaignPrizesResponse> => {
  const employee = await requireEmployeeRole(event, CAMPAIGN_ROLES);

  const campaignId = requireUuidParam(event, 'campaignId');

  await requireDemoEditor(employee, { kind: 'campaign', id: campaignId });

  try {
    const prizes = readCampaignPrizeFields(await readBody<CampaignPrizesRequestFields | null>(event));

    return await replaceCampaignPrizes(campaignId, prizes);
  } catch (error) {
    return rethrowCampaignFailure(error);
  }
});
