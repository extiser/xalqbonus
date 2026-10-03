import { listSurveyMailings } from '#server/repositories/surveyResults';
import { findSurvey, listSurveyQuestions } from '#server/repositories/surveys';
import { UnknownSurveyError } from '#server/services/surveys/errors';
import { readFunnelResults } from '#server/services/surveys/surveyResults';
import type { SurveyResultsResponse } from '#shared/types/surveyResults';

/**
 * Итоги у опроса (issue #325): рассылки, которыми он ушёл, и сводная воронка по всем ним.
 * Кто получил основную рассылку и напоминание, в сводке один: круг — люди без повторов.
 * Нет опроса — `UnknownSurveyError`.
 */
export const readSurveyResults = async (surveyId: string): Promise<SurveyResultsResponse> => {
  if (!(await findSurvey(surveyId))) {
    throw new UnknownSurveyError(surveyId);
  }

  const [mailings, questions] = await Promise.all([
    listSurveyMailings(surveyId),
    listSurveyQuestions(surveyId),
  ]);

  const summary = await readFunnelResults(
    { surveyId, cohort: { kind: 'survey', surveyId }, slice: null },
    questions,
  );

  return {
    mailings: mailings.map((row) => ({
      mailingId: row.mailingId,
      title: row.title,
      startedAt: row.startedAt.toISOString(),
      sent: row.sent,
      completed: row.completed,
    })),
    summary,
  };
};
