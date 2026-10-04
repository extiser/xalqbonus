import { createSurveySegment } from '#server/services/surveys/createSurveySegment';
import { requireDemoEditor, requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { rethrowSurveyFailure } from '#server/utils/surveyFailure';
import { SEGMENT_ROLES } from '#shared/access';
import type { SegmentResponse } from '#shared/types/segment';

// Сегмент-список из итогов опроса (issue #356): группа сводной воронки фиксируется списком
// людей. Права — как у заведения сегмента; демо-опрос — только тому, кто правит демо: из него
// выходит демо-сегмент. Автор — вошедший сотрудник из сессии.
export default defineEventHandler(async (event): Promise<SegmentResponse> => {
  const employee = await requireEmployeeRole(event, SEGMENT_ROLES);

  const surveyId = requireUuidParam(event, 'surveyId');

  await requireDemoEditor(employee, { kind: 'survey', id: surveyId });

  const body = await readBody<{ group?: unknown } | null>(event);

  try {
    return { segment: await createSurveySegment(surveyId, body?.group, employee.employeeId) };
  } catch (error) {
    return rethrowSurveyFailure(error);
  }
});
