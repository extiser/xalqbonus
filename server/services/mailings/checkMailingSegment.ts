import { findSegment, type SegmentRow } from '#server/repositories/segments';
import {
  MailingSegmentArchivedError,
  MailingSegmentDemoMismatchError,
  MailingSegmentUnknownError,
} from '#server/services/mailings/errors';

/**
 * Годится ли сегмент рассылке (issue #321): есть, того же мира — демо-рассылка только
 * с демо-сегментом, живая только с живым — и не в архиве. Те же проверки, что у акции
 * (`checkCampaignSegment.ts`), и при выборе, и при запуске.
 *
 * Возвращает строку сегмента: запуску из неё строить снимок.
 */
export const assertMailingSegment = (
  segment: SegmentRow | null,
  segmentId: string,
  mailingIsDemo: boolean,
): SegmentRow => {
  if (!segment) {
    throw new MailingSegmentUnknownError(segmentId);
  }

  if (segment.isDemo !== mailingIsDemo) {
    throw new MailingSegmentDemoMismatchError(segmentId, mailingIsDemo);
  }

  if (segment.archivedAt !== null) {
    throw new MailingSegmentArchivedError(segmentId);
  }

  return segment;
};

/**
 * Проверка выбора при сохранении черновика.
 *
 * Только когда сегмент выбирают заново, а не всякой правкой: сегмент мог уйти в архив уже
 * после выбора, и отказ на каждую букву текста превратил бы автосохранение в тупик. Такой
 * черновик сохраняется, а не пускает его запуск — как у акции.
 */
export const checkMailingSegment = async (
  segmentId: string | null,
  previousSegmentId: string | null,
  mailingIsDemo: boolean,
): Promise<void> => {
  if (segmentId === null || segmentId === previousSegmentId) {
    return;
  }

  assertMailingSegment(await findSegment(segmentId), segmentId, mailingIsDemo);
};
