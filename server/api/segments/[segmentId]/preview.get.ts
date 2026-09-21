import { previewSavedSegment } from '#server/services/segments/previewSegment';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { readPositiveInteger, requireUuidParam } from '#server/utils/query';
import { rethrowSegmentFailure } from '#server/utils/segmentFailure';
import { SEGMENT_ROLES } from '#shared/access';
import type { SegmentPreviewResponse } from '#shared/types/segment';

// Число и страница состава сохранённого сегмента на сейчас, по 25 строк. Смещение — в строке
// запроса: испорченное значение даёт первую страницу, а не отказ.
export default defineEventHandler(async (event): Promise<SegmentPreviewResponse> => {
  await requireEmployeeRole(event, SEGMENT_ROLES);

  const segmentId = requireUuidParam(event, 'segmentId');

  try {
    return await previewSavedSegment(segmentId, readPositiveInteger(getQuery(event).offset, 0));
  } catch (error) {
    return rethrowSegmentFailure(error);
  }
});
