import {
  findSurveyResponse,
  insertSurveyOpened,
  listSurveyAnswers,
} from '#server/repositories/surveyResponses';
import { listSurveyOptions, listSurveyQuestions } from '#server/repositories/surveys';
import type { LinkedDriver } from '#server/services/drivers/readLinkedDriver';
import {
  findAvailableSurvey,
  presentMemberSurvey,
  readSurveyFinishPoints,
  surveyStage,
} from '#server/services/surveys/memberSurveyScreen';
import type { MiniAppSurveyResponse } from '#shared/types/memberSurvey';

/**
 * Опрос, открытый водителем по кнопке рассылки или с плашки на главной (issue #323).
 *
 * Первое открытие ставит `opened_at` — строкой прохождения, один раз на пару. Закрытый по сроку
 * и пройденный опрос ничего не пишут: их экраны — только показ.
 *
 * Опроса нет или он недоступен — `{ survey: null }`, а не отказ: Mini App показывает главную,
 * как без параметра.
 *
 * «Сейчас» приходит параметром: от него зависит, закрыт ли опрос.
 */
export const readMemberSurvey = async (
  driver: LinkedDriver,
  surveyId: string,
  now: Date,
): Promise<MiniAppSurveyResponse> => {
  const survey = await findAvailableSurvey(surveyId, driver);

  if (!survey) {
    return { survey: null };
  }

  const response = await findSurveyResponse(surveyId, driver.personId);
  const stage = surveyStage(survey, response, now);

  if (!response && stage === 'intro') {
    await insertSurveyOpened(surveyId, driver.personId);
  }

  const [questions, options, answers, finishPoints] = await Promise.all([
    listSurveyQuestions(surveyId),
    listSurveyOptions(surveyId),
    listSurveyAnswers(surveyId, driver.personId),
    stage === 'finish' ? readSurveyFinishPoints(survey, driver.personId) : survey.points,
  ]);

  return {
    survey: presentMemberSurvey({
      survey,
      questions,
      options,
      finishPoints,
      stage,
      answers,
      language: driver.language,
    }),
  };
};
