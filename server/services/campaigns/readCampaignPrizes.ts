import { findCampaign } from '#server/repositories/campaigns';
import { listCampaignPrizes } from '#server/repositories/campaignPrizes';
import { UnknownCampaignError } from '#server/services/campaigns/errors';
import { toChestPrizes } from '#server/services/campaigns/prizeFields';
import type { CampaignPrizesResponse } from '#shared/types/campaign';

/** Призы акции по сундукам и признак, правится ли набор: только у черновика (issue #180). */
export const readCampaignPrizes = async (campaignId: string): Promise<CampaignPrizesResponse> => {
  const campaign = await findCampaign(campaignId);

  if (!campaign) {
    throw new UnknownCampaignError(campaignId);
  }

  return {
    editable: campaign.status === 'draft',
    chests: toChestPrizes(await listCampaignPrizes(campaignId)),
  };
};
