import { consola } from 'consola';
import { db } from '#server/db';
import {
  findCampaign,
  insertCampaignHalf,
  insertCampaignParticipants,
  lockCampaignStatus,
  markCampaignRunning,
} from '#server/repositories/campaigns';
import { findSegment } from '#server/repositories/segments';
import {
  CampaignAudienceEmptyError,
  CampaignNotLaunchableError,
  CampaignSegmentArchivedError,
  CampaignSegmentUnknownError,
  CampaignStatusMismatchError,
  UnknownCampaignError,
} from '#server/services/campaigns/errors';
import { readCampaign } from '#server/services/campaigns/readCampaign';
import { toSegmentConditions } from '#server/services/segments/fields';
import { campaignLaunchProblems } from '#shared/campaign';
import type { CampaignResponse } from '#shared/types/campaign';

/**
 * Запуск акции: снимок состава из сегмента и перевод черновика в работу — одной транзакцией.
 *
 * Строка акции берётся под блокировку первой, и всё дальше судит по ней: два нажатия
 * «Запустить» идут по очереди, и второе видит уже запущенную акцию — отказ, а не «прошло
 * и ничего не сделало». Снимок, снятый без смены статуса, или статус без снимка — оба
 * откатываются целиком.
 *
 * Состав берётся построителем сегментов (`segmentMembersSql`) — тем же, которым считается
 * предпросмотр. После запуска он не пересчитывается ничем и никогда: ручки «обновить состав»
 * нет и не будет (issue #166).
 */
const log = consola.withTag('campaigns:launch');

export const launchCampaign = async (campaignId: string): Promise<CampaignResponse> => {
  const snapshot = await db.$transaction(async (transaction) => {
    const status = await lockCampaignStatus(campaignId, transaction);

    if (status === null) {
      throw new UnknownCampaignError(campaignId);
    }

    if (status !== 'draft') {
      throw new CampaignStatusMismatchError(campaignId, status, 'draft');
    }

    const campaign = await findCampaign(campaignId, transaction);

    if (!campaign) {
      throw new UnknownCampaignError(campaignId);
    }

    const problems = campaignLaunchProblems({
      title: campaign.title,
      slug: campaign.slug,
      segmentId: campaign.segmentId,
      startsOn: campaign.halfA.startsOn,
      endsOn: campaign.halfA.endsOn,
    });

    if (problems.length > 0 || campaign.segmentId === null) {
      throw new CampaignNotLaunchableError(campaignId, problems);
    }

    const segment = await findSegment(campaign.segmentId, transaction);

    if (!segment) {
      throw new CampaignSegmentUnknownError(campaign.segmentId);
    }

    if (segment.archivedAt !== null) {
      throw new CampaignSegmentArchivedError(segment.id);
    }

    const audienceSize = await insertCampaignParticipants(
      campaignId,
      toSegmentConditions(segment),
      campaign.splitEnabled,
      transaction,
    );

    // Запускать не на ком — это не акция. Исключение откатывает и снимок, и статус.
    if (audienceSize === 0) {
      throw new CampaignAudienceEmptyError(campaignId);
    }

    // Строка окна Б — с пустыми датами: половина ждёт своей очереди, и назначают её отдельно.
    if (campaign.splitEnabled) {
      await insertCampaignHalf(campaignId, 'b', { startsOn: null, endsOn: null }, transaction);
    }

    if (!(await markCampaignRunning(campaignId, audienceSize, transaction))) {
      throw new CampaignStatusMismatchError(campaignId, status, 'draft');
    }

    return { audienceSize, splitEnabled: campaign.splitEnabled };
  });

  log.info('акция запущена, снимок снят', { campaignId, ...snapshot });

  return readCampaign(campaignId);
};
