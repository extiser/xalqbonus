import { readSurvey } from '#server/services/surveys/readSurvey';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { rethrowSurveyFailure } from '#server/utils/surveyFailure';
import { MAILING_ROLES } from '#shared/access';
import type { SurveyResponse } from '#shared/types/survey';

export default defineEventHandler(async (event): Promise<SurveyResponse> => {
  await requireEmployeeRole(event, MAILING_ROLES);

  const surveyId = requireUuidParam(event, 'surveyId');

  try {
    return { survey: await readSurvey(surveyId) };
  } catch (error) {
    return rethrowSurveyFailure(error);
  }
});
