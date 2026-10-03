import { consola } from 'consola';
import { db } from '#server/db';
import { lockSurvey, markSurveyFinished } from '#server/repositories/surveys';
import { isSurveyClosed } from '#server/services/surveys/closed';
import {
  SurveyFinishedError,
  SurveyNotFinishableError,
  UnknownSurveyError,
} from '#server/services/surveys/errors';
import { readSurvey } from '#server/services/surveys/readSurvey';
import type { Survey } from '#shared/types/survey';

/**
 * «Завершить опрос» — досрочно, отметкой (issue #348). Последний день не трогается: опрос
 * закрыт, если прошёл последний день или стоит отметка (`isSurveyClosed`).
 *
 * Завершается только замороженный и ещё не закрытый опрос — ни по сроку, ни досрочно. Черновик
 * никуда не уходил, и закрывать в нём нечего. Открыть обратно нельзя ничем.
 *
 * Повтор и гонка двух нажатий — один раз: строка берётся под блокировку, а отметка ставится
 * условием «ещё пусто» в самом `UPDATE`. Второе нажатие ждёт первое и получает
 * `SurveyFinishedError` — время и автор остаются от первого.
 */
const log = consola.withTag('surveys:finish');

export const finishSurvey = async (surveyId: string, finishedById: string): Promise<Survey> => {
  await db.$transaction(async (transaction) => {
    const current = await lockSurvey(surveyId, transaction);

    if (!current) {
      throw new UnknownSurveyError(surveyId);
    }

    if (!current.frozen) {
      throw new SurveyNotFinishableError(surveyId, 'draft');
    }

    if (current.finishedAt !== null) {
      throw new SurveyFinishedError(surveyId, 'finish');
    }

    if (isSurveyClosed(current, new Date())) {
      throw new SurveyNotFinishableError(surveyId, 'closed');
    }

    // Под блокировкой выше отметку никто не поставил; условие в `UPDATE` — вторая страховка.
    if (!(await markSurveyFinished(surveyId, finishedById, transaction))) {
      throw new SurveyFinishedError(surveyId, 'finish');
    }
  });

  log.info('опрос завершён досрочно', { surveyId, finishedById });

  return readSurvey(surveyId);
};
