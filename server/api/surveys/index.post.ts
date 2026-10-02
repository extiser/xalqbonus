import { createSurvey } from '#server/services/surveys/createSurvey';
import { readSurveyRequest, type SurveyRequestFields } from '#server/services/surveys/fields';
import { requireDemoEditor, requireEmployeeRole } from '#server/utils/employeeAuth';
import { rethrowSurveyFailure } from '#server/utils/surveyFailure';
import { MAILING_ROLES } from '#shared/access';
import type { SurveyResponse } from '#shared/types/survey';

// Заведение черновика опроса — первым набранным символом формы, поэтому обязательных полей
// нет (issue #148). Демо-опрос заводит только тот, кто правит демо (issue #212).
export default defineEventHandler(async (event): Promise<SurveyResponse> => {
  const employee = await requireEmployeeRole(event, MAILING_ROLES);

  const body = await readBody<SurveyRequestFields | null>(event);
  const isDemo = body?.isDemo === true;

  await requireDemoEditor(employee, isDemo);

  try {
    return { survey: await createSurvey(readSurveyRequest(body), employee.employeeId, isDemo) };
  } catch (error) {
    return rethrowSurveyFailure(error);
  }
});
