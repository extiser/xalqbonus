import { readSegmentFields, type SegmentRequestFields } from '#server/services/segments/fields';
import { updateSegment } from '#server/services/segments/updateSegment';
import { requireDemoEditor, requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { rethrowSegmentFailure } from '#server/utils/segmentFailure';
import { SEGMENT_ROLES } from '#shared/access';
import type { SegmentResponse } from '#shared/types/segment';

// Правка сегмента целиком — тело то же, что у заведения. Архивность этим запросом
// не меняется: у неё своя кнопка и своя ручка.
export default defineEventHandler(async (event): Promise<SegmentResponse> => {
  const employee = await requireEmployeeRole(event, SEGMENT_ROLES);

  const segmentId = requireUuidParam(event, 'segmentId');

  await requireDemoEditor(employee, { kind: 'segment', id: segmentId });

  try {
    const fields = readSegmentFields(await readBody<SegmentRequestFields | null>(event));

    return { segment: await updateSegment(segmentId, fields) };
  } catch (error) {
    return rethrowSegmentFailure(error);
  }
});
