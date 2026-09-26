import { launchCampaign } from '#server/services/campaigns/launchCampaign';
import { rethrowCampaignFailure } from '#server/utils/campaignFailure';
import { requireDemoEditor, requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { CAMPAIGN_ROLES } from '#shared/access';
import type { CampaignResponse } from '#shared/types/campaign';

// Запуск: снимок состава из сегмента и перевод в работу одной транзакцией. Повтор для уже
// запущенной акции отвечает `409` — второго снимка нет.
export default defineEventHandler(async (event): Promise<CampaignResponse> => {
  const employee = await requireEmployeeRole(event, CAMPAIGN_ROLES);

  const campaignId = requireUuidParam(event, 'campaignId');

  await requireDemoEditor(employee, { kind: 'campaign', id: campaignId });

  try {
    return await launchCampaign(campaignId);
  } catch (error) {
    return rethrowCampaignFailure(error);
  }
});
