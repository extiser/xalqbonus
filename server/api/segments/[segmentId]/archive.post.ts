import { setSegmentArchived } from '#server/services/segments/setSegmentArchived';
import { requireDemoEditor, requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { rethrowSegmentFailure } from '#server/utils/segmentFailure';
import { SEGMENT_ROLES } from '#shared/access';
import type { SegmentResponse } from '#shared/types/segment';

// Убрать сегмент из обращения. Удаления нет: на сегмент ссылаются рассылки и акции, и удалённый
// унёс бы ответ на вопрос «кого мы тогда звали». Повтор на архивном время архива не двигает.
export default defineEventHandler(async (event): Promise<SegmentResponse> => {
  const employee = await requireEmployeeRole(event, SEGMENT_ROLES);

  const segmentId = requireUuidParam(event, 'segmentId');

  await requireDemoEditor(employee, { kind: 'segment', id: segmentId });

  try {
    return { segment: await setSegmentArchived(segmentId, true) };
  } catch (error) {
    return rethrowSegmentFailure(error);
  }
});
