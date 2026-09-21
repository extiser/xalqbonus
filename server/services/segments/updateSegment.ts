import { findSegment, updateSegmentFields } from '#server/repositories/segments';
import { UnknownSegmentError } from '#server/services/segments/errors';
import { toSegment, type SegmentFields } from '#server/services/segments/fields';
import type { Segment } from '#shared/types/segment';

/**
 * Правка сегмента: форма отдаёт все поля сразу, и здесь они все и записываются.
 *
 * Правится и архивный: людей сегмент не хранит, и рассылка, ушедшая по нему, помнит свой
 * снимок адресатов, а не условия. Отметка архива этой правкой не двигается — у неё своя
 * кнопка и своя ручка.
 */
export const updateSegment = async (segmentId: string, fields: SegmentFields): Promise<Segment> => {
  const updated = await updateSegmentFields(segmentId, fields);
  const row = updated ? await findSegment(segmentId) : null;

  if (!row) {
    throw new UnknownSegmentError(segmentId);
  }

  return toSegment(row);
};
