import { createCampaign } from '#server/services/campaigns/createCampaign';
import { readCampaignFields, type CampaignRequestFields } from '#server/services/campaigns/fields';
import { rethrowCampaignFailure } from '#server/utils/campaignFailure';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { CAMPAIGN_ROLES } from '#shared/access';
import type { CampaignResponse } from '#shared/types/campaign';

// Заведение черновика акции — первым действием формы, поэтому обязательных полей нет
// (issue #148): чего не хватает, решает запуск.
export default defineEventHandler(async (event): Promise<CampaignResponse> => {
  const employee = await requireEmployeeRole(event, CAMPAIGN_ROLES);

  try {
    const fields = readCampaignFields(await readBody<CampaignRequestFields | null>(event));

    return await createCampaign(fields, employee.employeeId);
  } catch (error) {
    return rethrowCampaignFailure(error);
  }
});
