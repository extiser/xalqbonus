import { readSegment } from '#server/services/segments/readSegment';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { rethrowSegmentFailure } from '#server/utils/segmentFailure';
import { SEGMENT_ROLES } from '#shared/access';
import type { SegmentResponse } from '#shared/types/segment';

// Сегмент по ссылке — архивный открывается так же: из выбора он убран, из истории нет.
export default defineEventHandler(async (event): Promise<SegmentResponse> => {
  await requireEmployeeRole(event, SEGMENT_ROLES);

  const segmentId = requireUuidParam(event, 'segmentId');

  try {
    return { segment: await readSegment(segmentId) };
  } catch (error) {
    return rethrowSegmentFailure(error);
  }
});
