import { consola } from 'consola';
import { findSegment, updateSegmentArchived } from '#server/repositories/segments';
import { UnknownSegmentError } from '#server/services/segments/errors';
import { toSegment } from '#server/services/segments/fields';
import type { Segment } from '#shared/types/segment';

/**
 * Архив сегмента и возврат из него.
 *
 * Удаления нет и не будет: на сегмент ссылаются рассылки и акции, и удалённый унёс бы с собой
 * ответ на вопрос «кого мы тогда звали». Архивный не предлагается при выборе и остаётся
 * открываемым по ссылке — как архивный офис (`services/offices/setOfficeArchived.ts`).
 */
const log = consola.withTag('segments:archive');

export const setSegmentArchived = async (segmentId: string, archived: boolean): Promise<Segment> => {
  const updated = await updateSegmentArchived(segmentId, archived);
  const row = updated ? await findSegment(segmentId) : null;

  if (!row) {
    throw new UnknownSegmentError(segmentId);
  }

  log.info(archived ? 'сегмент в архиве' : 'сегмент вернулся из архива', { segmentId });

  return toSegment(row);
};
