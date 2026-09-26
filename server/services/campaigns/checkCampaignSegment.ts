import { findSegment } from '#server/repositories/segments';
import {
  CampaignSegmentArchivedError,
  CampaignSegmentDemoMismatchError,
  CampaignSegmentUnknownError,
} from '#server/services/campaigns/errors';

/**
 * Годится ли сегмент для черновика акции: есть, не в архиве и того же мира, что акция —
 * демо-акция только на демо-сегменте, живая только на живом (issue #212).
 *
 * Архивный отбивается, только когда его выбирают заново, а не всякой правкой черновика:
 * сегмент мог уйти в архив уже после того, как его выбрали, и тогда отказ на каждую букву
 * названия превратил бы автосохранение в тупик. Такой черновик сохраняется, а не пустит его
 * запуск (`launchCampaign.ts`). Признак демо не меняется ни у сегмента, ни у акции, поэтому
 * прежний выбор перепроверять незачем — запуск проверяет его всё равно.
 */
export const checkCampaignSegment = async (
  segmentId: string | null,
  previousSegmentId: string | null,
  campaignIsDemo: boolean,
): Promise<void> => {
  if (segmentId === null || segmentId === previousSegmentId) {
    return;
  }

  const segment = await findSegment(segmentId);

  if (!segment) {
    throw new CampaignSegmentUnknownError(segmentId);
  }

  if (segment.isDemo !== campaignIsDemo) {
    throw new CampaignSegmentDemoMismatchError(segmentId, campaignIsDemo);
  }

  if (segment.archivedAt !== null) {
    throw new CampaignSegmentArchivedError(segmentId);
  }
};
