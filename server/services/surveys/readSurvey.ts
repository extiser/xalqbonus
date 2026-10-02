import {
  findSurvey,
  listSurveyOptions,
  listSurveyQuestions,
  listSurveys,
} from '#server/repositories/surveys';
import { UnknownSurveyError } from '#server/services/surveys/errors';
import { toSurvey, toSurveyListItem } from '#server/services/surveys/fields';
import type { Survey, SurveyListItem } from '#shared/types/survey';

/** Опрос с вопросами и вариантами. Нет такого — `UnknownSurveyError`. */
export const readSurvey = async (surveyId: string): Promise<Survey> => {
  const row = await findSurvey(surveyId);

  if (!row) {
    throw new UnknownSurveyError(surveyId);
  }

  const [questions, options] = await Promise.all([
    listSurveyQuestions(surveyId),
    listSurveyOptions(surveyId),
  ]);

  return toSurvey(row, questions, options, new Date());
};

/** Все опросы, свежие первыми, с числом вопросов. */
export const readSurveyList = async (): Promise<SurveyListItem[]> => {
  const moment = new Date();

  return (await listSurveys()).map((row) => toSurveyListItem(row, moment));
};
