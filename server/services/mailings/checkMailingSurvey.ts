import { findSurvey, type SurveyRow } from '#server/repositories/surveys';
import {
  MailingSurveyClosedError,
  MailingSurveyDemoMismatchError,
  MailingSurveyUnknownError,
} from '#server/services/mailings/errors';
import { isSurveyClosed } from '#server/services/surveys/closed';

/**
 * Годится ли опрос рассылке (issue #321) — то, что проверяется и при выборе, и при запуске:
 *
 * - признак демо совпадает: живой опрос в демо-рассылке начислил бы баллы демо-водителям
 *   тем же ключом, что живым
 * - опрос не закрыт — ни по сроку по Ташкенту, ни досрочно (issue #348) — `isSurveyClosed`
 *
 * Полнота сюда не входит: она — условие запуска, а не выбора.
 * Черновик опроса правится и после прикрепления, и проверка при выборе ничего бы
 * не гарантировала, а автосохранение рассылки падало бы из-за опроса, который дописывают
 * в соседней вкладке.
 */
export const assertMailingSurvey = (
  survey: SurveyRow | null,
  surveyId: string,
  mailingIsDemo: boolean,
  moment: Date,
): SurveyRow => {
  if (!survey) {
    throw new MailingSurveyUnknownError(surveyId);
  }

  if (survey.isDemo !== mailingIsDemo) {
    throw new MailingSurveyDemoMismatchError(surveyId, mailingIsDemo);
  }

  if (isSurveyClosed(survey, moment)) {
    throw new MailingSurveyClosedError(surveyId, survey.finishedAt !== null);
  }

  return survey;
};

/**
 * Проверка выбора при сохранении черновика — только когда опрос выбирают заново: срок мог
 * пройти уже после выбора, и автосохранение не должно на этом вставать. Не пустит такой
 * черновик запуск.
 */
export const checkMailingSurvey = async (
  surveyId: string | null,
  previousSurveyId: string | null,
  mailingIsDemo: boolean,
): Promise<void> => {
  if (surveyId === null || surveyId === previousSurveyId) {
    return;
  }

  assertMailingSurvey(await findSurvey(surveyId), surveyId, mailingIsDemo, new Date());
};
