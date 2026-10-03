import { finishSurvey } from '#server/services/surveys/finishSurvey';
import { requireDemoEditor, requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { rethrowSurveyFailure } from '#server/utils/surveyFailure';
import { MAILING_ROLES } from '#shared/access';
import type { SurveyResponse } from '#shared/types/survey';

// «Завершить опрос» досрочно (issue #348) — тем же, кто правит опрос. Черновик, закрытый
// по сроку и уже завершённый отвечают `409`. Отвечает опросом с отметкой.
export default defineEventHandler(async (event): Promise<SurveyResponse> => {
  const employee = await requireEmployeeRole(event, MAILING_ROLES);

  const surveyId = requireUuidParam(event, 'surveyId');

  await requireDemoEditor(employee, { kind: 'survey', id: surveyId });

  try {
    return { survey: await finishSurvey(surveyId, employee.employeeId) };
  } catch (error) {
    return rethrowSurveyFailure(error);
  }
});
