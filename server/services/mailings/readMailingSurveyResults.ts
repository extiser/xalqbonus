import { listSurveyOptions, listSurveyQuestions } from '#server/repositories/surveys';
import {
  resolveMailingSurveyScope,
  type MailingSurveyResultsParams,
} from '#server/services/mailings/mailingSurveyScope';
import { readFunnelResults, readQuestionResults } from '#server/services/surveys/surveyResults';
import type { MailingSurveyResults } from '#shared/types/surveyResults';

/**
 * Итоги опроса у рассылки (issue #325) — одной таблицей: воронка, «Где бросают» и ответы
 * по вопросам, по людям снимка этой рассылки. Срез даёт две колонки рядом с итогом,
 * `completedOnly` сужает ответы до прошедших — воронку он не трогает.
 */
export const readMailingSurveyResults = async (
  mailingId: string,
  params: MailingSurveyResultsParams,
): Promise<MailingSurveyResults> => {
  const { mailing, scope, slice } = await resolveMailingSurveyScope(mailingId, params.slice);

  const [questions, options] = await Promise.all([
    listSurveyQuestions(scope.surveyId),
    listSurveyOptions(scope.surveyId),
  ]);

  const [funnel, questionResults] = await Promise.all([
    readFunnelResults(scope, questions),
    readQuestionResults(scope, params.completedOnly, questions, options),
  ]);

  return {
    ...funnel,
    surveyId: scope.surveyId,
    surveyTitle: mailing.surveyTitle,
    slice,
    completedOnly: params.completedOnly,
    questions: questionResults,
  };
};
