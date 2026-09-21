import { consola } from 'consola';
import { findSegment, insertSegment } from '#server/repositories/segments';
import { toSegment, type SegmentFields } from '#server/services/segments/fields';
import type { Segment } from '#shared/types/segment';

/**
 * Заведение сегмента. Условия уже разобраны и непусты (`readSegmentFields`), а пустой набор
 * не пропустит и база — проверкой `segments_has_condition_check`.
 *
 * Уникальности имени нет, как у офисов: два одинаковых имени — состояние, а не ошибка ввода.
 */
const log = consola.withTag('segments:create');

export const createSegment = async (fields: SegmentFields, employeeId: string): Promise<Segment> => {
  const segmentId = await insertSegment({ ...fields, createdById: employeeId });
  const row = await findSegment(segmentId);

  if (!row) {
    throw new Error(`заведённый сегмент ${segmentId} не прочитался`);
  }

  log.info('сегмент заведён', { segmentId, name: row.name });

  return toSegment(row);
};
