import { findSegment, listSegmentPersonIds } from '#server/repositories/segments';
import { UnknownSegmentError } from '#server/services/segments/errors';
import { toSegmentConditions } from '#server/services/segments/fields';

/**
 * Состав сегмента на сейчас — для потребителя: рассылки, акции.
 *
 * Тот же построитель, что у счётчика и предпросмотра (`repositories/segments.ts` →
 * `segmentMembersSql`): правка условия меняет и число на экране, и то, что уйдёт потребителю,
 * разом. Замораживает состав потребитель, своим снимком, — здесь его не хранят.
 *
 * Архивный отдаёт состав так же: убран он из выбора, а не из работы. Решает, звать ли
 * по архивному, тот, кто выбирает сегмент.
 */
export const readSegmentPersonIds = async (segmentId: string): Promise<string[]> => {
  const row = await findSegment(segmentId);

  if (!row) {
    throw new UnknownSegmentError(segmentId);
  }

  return listSegmentPersonIds(toSegmentConditions(row));
};
