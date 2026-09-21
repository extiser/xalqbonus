import {
  countCampaignParticipants,
  findCampaign,
  listCampaignParticipantsPage,
  type CampaignParticipantFilter,
  type CampaignParticipantSort,
} from '#server/repositories/campaigns';
import { UnknownCampaignError } from '#server/services/campaigns/errors';
import { CAMPAIGN_PARTICIPANTS_LIMIT } from '#shared/campaign';
import type { CampaignParticipantsResponse } from '#shared/types/campaign';

/**
 * Страница участников акции с фильтром по половине, состоянию и исходу и с порядком
 * по фамилии, зачётным дням или времени итога.
 *
 * Потолок страницы ставит сервис: он один знает, сколько строк ему не жалко отдать.
 * Больше страницы экрана не просят — сверх неё отдаётся ровно она.
 */
export const readCampaignParticipants = async (
  campaignId: string,
  filter: CampaignParticipantFilter,
  sort: CampaignParticipantSort,
  limit: number,
  offset: number,
): Promise<CampaignParticipantsResponse> => {
  if (!(await findCampaign(campaignId))) {
    throw new UnknownCampaignError(campaignId);
  }

  const pageLimit = Math.min(Math.max(limit, 1), CAMPAIGN_PARTICIPANTS_LIMIT);
  const pageOffset = Math.max(offset, 0);

  const [total, rows] = await Promise.all([
    countCampaignParticipants(campaignId, filter),
    listCampaignParticipantsPage(campaignId, filter, sort, pageLimit, pageOffset),
  ]);

  return {
    total,
    rows: rows.map((row) => ({
      personId: row.personId,
      lastName: row.lastName,
      firstName: row.firstName,
      middleName: row.middleName,
      callsigns: row.callsigns,
      half: row.half,
      state: row.state,
      changedAt: row.changedAt.toISOString(),
      outcome: row.outcome,
      qualifiedDays: row.qualifiedDays,
    })),
    limit: pageLimit,
    offset: pageOffset,
  };
};
