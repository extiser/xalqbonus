import { findSegment } from '#server/repositories/segments';
import {
  CampaignSegmentArchivedError,
  CampaignSegmentUnknownError,
} from '#server/services/campaigns/errors';

/**
 * Годится ли сегмент для черновика акции: есть и не в архиве.
 *
 * Архивный отбивается, только когда его выбирают заново, а не всякой правкой черновика:
 * сегмент мог уйти в архив уже после того, как его выбрали, и тогда отказ на каждую букву
 * названия превратил бы автосохранение в тупик. Такой черновик сохраняется, а не пустит его
 * запуск (`launchCampaign.ts`).
 */
export const checkCampaignSegment = async (
  segmentId: string | null,
  previousSegmentId: string | null,
): Promise<void> => {
  if (segmentId === null || segmentId === previousSegmentId) {
    return;
  }

  const segment = await findSegment(segmentId);

  if (!segment) {
    throw new CampaignSegmentUnknownError(segmentId);
  }

  if (segment.archivedAt !== null) {
    throw new CampaignSegmentArchivedError(segmentId);
  }
};
