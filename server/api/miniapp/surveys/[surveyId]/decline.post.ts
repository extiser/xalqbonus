import { declineMemberSurvey } from '#server/services/surveys/declineMemberSurvey';
import { requireMember } from '#server/utils/miniAppMember';
import { requireUuidParam } from '#server/utils/query';

// Кнопка отказа на экране открытия опроса (issue #323). Повтор отвечает успехом и ничего
// не меняет. Ответ пустой, `204`: экран уходит на главную.
export default defineEventHandler(async (event): Promise<null> => {
  const driver = await requireMember(event);
  const surveyId = requireUuidParam(event, 'surveyId');

  await declineMemberSurvey(driver, surveyId, new Date());

  setResponseStatus(event, 204);

  return null;
});
