import { readCampaignList } from '#server/services/campaigns/readCampaign';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { CAMPAIGN_ROLES } from '#shared/access';
import type { CampaignListResponse } from '#shared/types/campaign';

// Список акций: название, статус, окно половины А, сегмент и размер снимка. Менеджер получает
// отказ двери `role_not_allowed`.
export default defineEventHandler(async (event): Promise<CampaignListResponse> => {
  await requireEmployeeRole(event, CAMPAIGN_ROLES);

  return readCampaignList();
});
