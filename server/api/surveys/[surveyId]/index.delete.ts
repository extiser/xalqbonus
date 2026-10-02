import { deleteSurveyDraft } from '#server/services/surveys/deleteSurveyDraft';
import { requireDemoEditor, requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { rethrowSurveyFailure } from '#server/utils/surveyFailure';
import { MAILING_ROLES } from '#shared/access';

// Удаление черновика опроса вместе с вопросами. Замороженный отвечает `409`. Удалённому
// отвечать нечем — ответ пустой, `204`.
export default defineEventHandler(async (event): Promise<null> => {
  const employee = await requireEmployeeRole(event, MAILING_ROLES);

  const surveyId = requireUuidParam(event, 'surveyId');

  await requireDemoEditor(employee, { kind: 'survey', id: surveyId });

  try {
    await deleteSurveyDraft(surveyId);
  } catch (error) {
    return rethrowSurveyFailure(error);
  }

  setResponseStatus(event, 204);

  return null;
});
