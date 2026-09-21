import {
  countCampaignParticipantStates,
  findCampaign,
  listCampaigns,
} from '#server/repositories/campaigns';
import { UnknownCampaignError } from '#server/services/campaigns/errors';
import { toBreakdown, toCampaign } from '#server/services/campaigns/fields';
import type { CampaignListResponse, CampaignResponse } from '#shared/types/campaign';

/**
 * Карточка акции: сама акция, окна половин и разбивка состава по состояниям.
 *
 * Разбивка считается по снимку в момент запроса, а не лежит колонками: число, накопленное
 * по дороге, однажды разойдётся с построчным состоянием участников.
 */
export const readCampaign = async (campaignId: string): Promise<CampaignResponse> => {
  const row = await findCampaign(campaignId);

  if (!row) {
    throw new UnknownCampaignError(campaignId);
  }

  // У черновика снимка нет по построению — не спрашиваем.
  const counts = row.status === 'draft' ? [] : await countCampaignParticipantStates(campaignId);

  return { campaign: toCampaign(row), breakdown: toBreakdown(counts) };
};

/** Все акции, свежие первыми. */
export const readCampaignList = async (): Promise<CampaignListResponse> => ({
  campaigns: (await listCampaigns()).map(toCampaign),
});
