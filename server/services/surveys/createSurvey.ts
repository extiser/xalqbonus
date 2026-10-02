import { consola } from 'consola';
import { db } from '#server/db';
import { insertDraftSurvey, replaceSurveyQuestions } from '#server/repositories/surveys';
import { EMPTY_SURVEY_CONTENT, type SurveyRequest } from '#server/services/surveys/fields';
import { readSurvey } from '#server/services/surveys/readSurvey';
import type { Survey } from '#shared/types/survey';

/**
 * Заведение черновика опроса.
 *
 * Заводит его форма первым набранным символом (issue #148), поэтому поля могут быть пустыми
 * все: полнота текстов на обоих языках — условие заморозки, а не заведения.
 *
 * Признак демо ставится здесь и больше нигде — как у рассылки (issue #212). Кто вправе его
 * поставить, решила ручка — `requireDemoEditor`.
 */
const log = consola.withTag('surveys:create');

export const createSurvey = async (
  request: SurveyRequest,
  createdById: string,
  isDemo: boolean,
): Promise<Survey> => {
  const { questions, ...content } = request.content ?? EMPTY_SURVEY_CONTENT;

  const surveyId = await db.$transaction(async (transaction) => {
    const id = await insertDraftSurvey(
      { ...request.settings, ...content, createdById, isDemo },
      transaction,
    );

    await replaceSurveyQuestions(id, questions, transaction);

    return id;
  });

  log.info('черновик опроса заведён', { surveyId, createdById, isDemo });

  return readSurvey(surveyId);
};
