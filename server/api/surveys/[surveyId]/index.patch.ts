import { readSurveyRequest, type SurveyRequestFields } from '#server/services/surveys/fields';
import { updateSurvey } from '#server/services/surveys/updateSurvey';
import { requireDemoEditor, requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { rethrowSurveyFailure } from '#server/utils/surveyFailure';
import { MAILING_ROLES } from '#shared/access';
import type { SurveyResponse } from '#shared/types/survey';

// Правка опроса — ей сохраняет себя форма по мере набора. Черновик присылает всё,
// замороженный — только название и срок; содержимое замороженному отвечает `409`.
export default defineEventHandler(async (event): Promise<SurveyResponse> => {
  const employee = await requireEmployeeRole(event, MAILING_ROLES);

  const surveyId = requireUuidParam(event, 'surveyId');

  await requireDemoEditor(employee, { kind: 'survey', id: surveyId });

  try {
    const request = readSurveyRequest(await readBody<SurveyRequestFields | null>(event));

    return { survey: await updateSurvey(surveyId, request) };
  } catch (error) {
    return rethrowSurveyFailure(error);
  }
});
