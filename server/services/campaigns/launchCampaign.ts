import { consola } from 'consola';
import { db } from '#server/db';
import {
  findCampaign,
  insertCampaignHalf,
  insertCampaignParticipants,
  lockCampaignStatus,
  markCampaignRunning,
} from '#server/repositories/campaigns';
import { listCampaignPrizes } from '#server/repositories/campaignPrizes';
import { findOffice } from '#server/repositories/offices';
import { findSegment } from '#server/repositories/segments';
import {
  CampaignAudienceEmptyError,
  CampaignNotLaunchableError,
  CampaignOfficeDemoMismatchError,
  CampaignSegmentArchivedError,
  CampaignSegmentDemoMismatchError,
  CampaignSegmentUnknownError,
  CampaignStatusMismatchError,
  UnknownCampaignError,
} from '#server/services/campaigns/errors';
import { filledChestsOf, unavailablePrizeChestsOf } from '#server/services/campaigns/prizeFields';
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
 *
 * Демо-акция запускается тем же кодом (issue #212). Сегмент и офис выдачи сверяются с её
 * признаком ещё раз: черновик мог быть сохранён до того, как признак появился.
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

    // Набор — под той же блокировкой, что берёт его замена: он не сменится до конца запуска.
    // Товары проверяются здесь, а не только при заведении: между сохранением набора и запуском
    // товар мог уйти в архив, и открытый сундук остался бы без приза.
    const prizes = await listCampaignPrizes(campaignId, transaction);

    const problems = campaignLaunchProblems({
      title: campaign.title,
      slug: campaign.slug,
      segmentId: campaign.segmentId,
      startsOn: campaign.halfA.startsOn,
      endsOn: campaign.halfA.endsOn,
      officeId: campaign.officeId,
      rewardLifetimeDays:
        campaign.rewardLifetimeDays === null ? null : String(campaign.rewardLifetimeDays),
      filledChests: filledChestsOf(prizes),
      unavailablePrizeChests: unavailablePrizeChestsOf(prizes),
    });

    if (problems.length > 0 || campaign.segmentId === null) {
      throw new CampaignNotLaunchableError(campaignId, problems);
    }

    const segment = await findSegment(campaign.segmentId, transaction);

    if (!segment) {
      throw new CampaignSegmentUnknownError(campaign.segmentId);
    }

    if (segment.isDemo !== campaign.isDemo) {
      throw new CampaignSegmentDemoMismatchError(segment.id, campaign.isDemo);
    }

    if (segment.archivedAt !== null) {
      throw new CampaignSegmentArchivedError(segment.id);
    }

    const office = campaign.officeId === null ? null : await findOffice(campaign.officeId, transaction);

    if (office && office.isDemo !== campaign.isDemo) {
      throw new CampaignOfficeDemoMismatchError(office.id, campaign.isDemo);
    }

    // Строка окна Б — до снимка: половина участника ссылается на окно внешним ключом,
    // и первый же участник половины Б без неё отбился бы. Даты пусты: половина ждёт своей
    // очереди, и назначают её отдельно.
    if (campaign.splitEnabled) {
      await insertCampaignHalf(campaignId, 'b', { startsOn: null, endsOn: null }, transaction);
    }

    const audienceSize = await insertCampaignParticipants(
      campaignId,
      toSegmentConditions(segment),
      segment.isDemo,
      campaign.splitEnabled,
      transaction,
    );

    // Запускать не на ком — это не акция. Исключение откатывает и снимок, и окно Б, и статус.
    if (audienceSize === 0) {
      throw new CampaignAudienceEmptyError(campaignId);
    }

    if (!(await markCampaignRunning(campaignId, audienceSize, transaction))) {
      throw new CampaignStatusMismatchError(campaignId, status, 'draft');
    }

    return { audienceSize, splitEnabled: campaign.splitEnabled };
  });

  log.info('акция запущена, снимок снят', { campaignId, ...snapshot });

  return readCampaign(campaignId);
};
