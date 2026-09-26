import { createSegment } from '#server/services/segments/createSegment';
import { readSegmentFields, type SegmentRequestFields } from '#server/services/segments/fields';
import { requireDemoEditor, requireEmployeeRole } from '#server/utils/employeeAuth';
import { rethrowSegmentFailure } from '#server/utils/segmentFailure';
import { SEGMENT_ROLES } from '#shared/access';
import type { SegmentResponse } from '#shared/types/segment';

// Заведение сегмента. Без единого условия не заводится: такой сегмент — весь реестр парка.
// Автор — вошедший сотрудник из сессии, а не из тела запроса. Демо-сегмент заводит только
// владелец (issue #212).
export default defineEventHandler(async (event): Promise<SegmentResponse> => {
  const employee = await requireEmployeeRole(event, SEGMENT_ROLES);

  const body = await readBody<SegmentRequestFields | null>(event);
  const isDemo = body?.isDemo === true;

  await requireDemoEditor(employee, isDemo);

  try {
    const fields = readSegmentFields(body);

    return { segment: await createSegment(fields, employee.employeeId, isDemo) };
  } catch (error) {
    return rethrowSegmentFailure(error);
  }
});
