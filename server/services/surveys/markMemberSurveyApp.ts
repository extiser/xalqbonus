import { markSurveyAppClicked } from '#server/repositories/surveyResponses';
import type { LinkedDriver } from '#server/services/drivers/readLinkedDriver';
import { findAvailableSurvey } from '#server/services/surveys/memberSurveyScreen';

/**
 * Кнопка перехода в приложение на финале (issue #323): `app_clicked_at` один раз и только
 * у пройденного опроса — условием в самом `UPDATE`. Повтор и всё прочее — успех без записи:
 * экран и так уходит на главную.
 */
export const markMemberSurveyApp = async (driver: LinkedDriver, surveyId: string): Promise<void> => {
  const survey = await findAvailableSurvey(surveyId, driver);

  if (!survey) {
    return;
  }

  await markSurveyAppClicked(surveyId, driver.personId);
};
