import { consola } from 'consola';
import { markSurveyDeclined } from '#server/repositories/surveyResponses';
import type { LinkedDriver } from '#server/services/drivers/readLinkedDriver';
import { isSurveyClosed } from '#server/services/surveys/closed';
import { findAvailableSurvey } from '#server/services/surveys/memberSurveyScreen';

const log = consola.withTag('surveys:decline');

/**
 * Кнопка отказа на экране открытия (issue #323): `declined_at` один раз, экран уходит на главную.
 *
 * Отказ ничего не закрывает: отказавшийся, открыв опрос снова, видит экран открытия и может
 * начать, а на главной у него плашка «Пройдите опрос» — «Закрыть» могли нажать случайно (решение
 * Руслана 03-10-2026). Метка остаётся в воронке, какой была.
 *
 * Повтор, недоступный и закрытый — по сроку или досрочно — опрос — успех без записи: экрану водителя тут нечего
 * объяснять, он и так уходит на главную.
 */
export const declineMemberSurvey = async (
  driver: LinkedDriver,
  surveyId: string,
  now: Date,
): Promise<void> => {
  const survey = await findAvailableSurvey(surveyId, driver);

  if (!survey || isSurveyClosed(survey, now)) {
    return;
  }

  await markSurveyDeclined(surveyId, driver.personId);

  log.info('водитель отказался от опроса', { surveyId, personId: driver.personId });
};
