import { createCampaign } from '#server/services/campaigns/createCampaign';
import { readCampaignFields, type CampaignRequestFields } from '#server/services/campaigns/fields';
import { rethrowCampaignFailure } from '#server/utils/campaignFailure';
import { requireDemoEditor, requireEmployeeRole } from '#server/utils/employeeAuth';
import { CAMPAIGN_ROLES } from '#shared/access';
import type { CampaignResponse } from '#shared/types/campaign';

// Заведение черновика акции — первым действием формы, поэтому обязательных полей нет
// (issue #148): чего не хватает, решает запуск. Демо-акцию заводит только владелец (issue #212).
export default defineEventHandler(async (event): Promise<CampaignResponse> => {
  const employee = await requireEmployeeRole(event, CAMPAIGN_ROLES);

  const body = await readBody<CampaignRequestFields | null>(event);
  const isDemo = body?.isDemo === true;

  await requireDemoEditor(employee, isDemo);

  try {
    const fields = readCampaignFields(body);

    return await createCampaign(fields, employee.employeeId, isDemo);
  } catch (error) {
    return rethrowCampaignFailure(error);
  }
});
