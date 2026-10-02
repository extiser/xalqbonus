import { copySurvey } from '#server/services/surveys/copySurvey';
import { requireDemoEditor, requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { rethrowSurveyFailure } from '#server/utils/surveyFailure';
import { MAILING_ROLES } from '#shared/access';
import type { SurveyResponse } from '#shared/types/survey';

// Копия любого опроса — черновика и замороженного — в новый черновик. Отвечает копией:
// следующий шаг — её страница.
export default defineEventHandler(async (event): Promise<SurveyResponse> => {
  const employee = await requireEmployeeRole(event, MAILING_ROLES);

  const surveyId = requireUuidParam(event, 'surveyId');

  await requireDemoEditor(employee, { kind: 'survey', id: surveyId });

  try {
    return { survey: await copySurvey(surveyId, employee.employeeId) };
  } catch (error) {
    return rethrowSurveyFailure(error);
  }
});
