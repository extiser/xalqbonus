import { readSurveyResults } from '#server/services/surveys/readSurveyResults';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { rethrowSurveyFailure } from '#server/utils/surveyFailure';
import { MAILING_ROLES } from '#shared/access';
import type { SurveyResultsResponse } from '#shared/types/surveyResults';

// Рассылки опроса и сводная воронка по ним (issue #325).
export default defineEventHandler(async (event): Promise<SurveyResultsResponse> => {
  await requireEmployeeRole(event, MAILING_ROLES);

  const surveyId = requireUuidParam(event, 'surveyId');

  try {
    return await readSurveyResults(surveyId);
  } catch (error) {
    return rethrowSurveyFailure(error);
  }
});
