import { setSegmentArchived } from '#server/services/segments/setSegmentArchived';
import { requireDemoEditor, requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { rethrowSegmentFailure } from '#server/utils/segmentFailure';
import { SEGMENT_ROLES } from '#shared/access';
import type { SegmentResponse } from '#shared/types/segment';

// Вернуть сегмент из архива. Своей ручкой, а не флагом в теле правки: вернуть срез в обращение —
// решение, и в журнале запросов оно видно отдельной строкой.
export default defineEventHandler(async (event): Promise<SegmentResponse> => {
  const employee = await requireEmployeeRole(event, SEGMENT_ROLES);

  const segmentId = requireUuidParam(event, 'segmentId');

  await requireDemoEditor(employee, { kind: 'segment', id: segmentId });

  try {
    return { segment: await setSegmentArchived(segmentId, false) };
  } catch (error) {
    return rethrowSegmentFailure(error);
  }
});
