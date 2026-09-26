import { readCampaignFields, type CampaignRequestFields } from '#server/services/campaigns/fields';
import { updateCampaign } from '#server/services/campaigns/updateCampaign';
import { rethrowCampaignFailure } from '#server/utils/campaignFailure';
import { requireDemoEditor, requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { CAMPAIGN_ROLES } from '#shared/access';
import type { CampaignResponse } from '#shared/types/campaign';

// Правка черновика целиком — ей сохраняет себя форма по мере правки. Запущенная акция
// отвечает `409`: ни сегмент, ни окно половины А, ни деление после запуска не меняются.
export default defineEventHandler(async (event): Promise<CampaignResponse> => {
  const employee = await requireEmployeeRole(event, CAMPAIGN_ROLES);

  const campaignId = requireUuidParam(event, 'campaignId');

  await requireDemoEditor(employee, { kind: 'campaign', id: campaignId });

  try {
    const fields = readCampaignFields(await readBody<CampaignRequestFields | null>(event));

    return await updateCampaign(campaignId, fields);
  } catch (error) {
    return rethrowCampaignFailure(error);
  }
});
