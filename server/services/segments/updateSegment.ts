import { findSegment, updateSegmentFields } from '#server/repositories/segments';
import { UnknownSegmentError } from '#server/services/segments/errors';
import {
  assertListWithoutConditions,
  assertSegmentBounded,
  toSegment,
  type SegmentFields,
} from '#server/services/segments/fields';
import type { Segment } from '#shared/types/segment';

/**
 * Правка сегмента: форма отдаёт все поля сразу, и здесь они все и записываются.
 *
 * Правится и архивный: людей сегмент не хранит, и рассылка, ушедшая по нему, помнит свой
 * снимок адресатов, а не условия. Отметка архива этой правкой не двигается — у неё своя
 * кнопка и своя ручка.
 *
 * Пустые условия — только у демо-сегмента (issue #212): признак берётся из записи, он
 * после заведения не меняется.
 *
 * У списка (issue #356) правятся только имя и описание: условие поверх зафиксированного
 * состава — отказ `list_conditions_locked`, пустые условия — норма.
 */
export const updateSegment = async (segmentId: string, fields: SegmentFields): Promise<Segment> => {
  const current = await findSegment(segmentId);

  if (!current) {
    throw new UnknownSegmentError(segmentId);
  }

  if (current.kind === 'list') {
    assertListWithoutConditions(fields.conditions);
  } else {
    assertSegmentBounded({ conditions: fields.conditions, isDemo: current.isDemo, listSegmentId: null });
  }

  const updated = await updateSegmentFields(segmentId, fields);
  const row = updated ? await findSegment(segmentId) : null;

  if (!row) {
    throw new UnknownSegmentError(segmentId);
  }

  return toSegment(row);
};
