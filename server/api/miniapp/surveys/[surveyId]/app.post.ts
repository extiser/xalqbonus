import { markMemberSurveyApp } from '#server/services/surveys/markMemberSurveyApp';
import { requireMember } from '#server/utils/miniAppMember';
import { requireUuidParam } from '#server/utils/query';

// Кнопка перехода в приложение на финале опроса (issue #323). Повтор отвечает успехом
// и ничего не меняет. Ответ пустой, `204`: экран уходит на главную.
export default defineEventHandler(async (event): Promise<null> => {
  const driver = await requireMember(event);
  const surveyId = requireUuidParam(event, 'surveyId');

  await markMemberSurveyApp(driver, surveyId);

  setResponseStatus(event, 204);

  return null;
});
