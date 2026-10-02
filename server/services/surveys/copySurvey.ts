import { consola } from 'consola';
import { db } from '#server/db';
import { insertDraftSurvey, replaceSurveyQuestions } from '#server/repositories/surveys';
import { copyMailingTitle } from '#server/services/mailings/copyMailing';
import { readSurvey } from '#server/services/surveys/readSurvey';
import type { Survey } from '#shared/types/survey';

/**
 * Копия опроса в новый черновик — со всеми вопросами, вариантами и настройками, кроме
 * заморозки. Копируется любой опрос: черновик — чтобы сделать второй похожий, замороженный —
 * чтобы поправить то, что в нём уже не правится.
 *
 * Заголовок — с пометкой копии, той же, что у рассылки (`copyMailingTitle`): правило одно,
 * и копия копии так же не копит пометок.
 *
 * Копия — новый опрос с новым `id`: за него баллы приходят снова (docs/points.md → «Баллы
 * за опрос»). Признак демо копия берёт у оригинала — иначе копия стала бы способом
 * превратить живое в демо и обратно (issue #212).
 */
const log = consola.withTag('surveys:copy');

export const copySurvey = async (surveyId: string, createdById: string): Promise<Survey> => {
  // Читается вне транзакции копии: оригинал копия не меняет, а его правка, пришедшая
  // одновременно, — это правка после копии, а не потерянная.
  const source = await readSurvey(surveyId);

  const copyId = await db.$transaction(async (transaction) => {
    const id = await insertDraftSurvey(
      {
        title: copyMailingTitle(source.title, new Date()),
        endsOn: source.endsOn,
        points: source.points,
        introRu: source.introRu,
        introUz: source.introUz,
        finishRu: source.finishRu,
        finishUz: source.finishUz,
        declineButtonRu: source.declineButtonRu,
        declineButtonUz: source.declineButtonUz,
        appButtonRu: source.appButtonRu,
        appButtonUz: source.appButtonUz,
        createdById,
        isDemo: source.isDemo,
      },
      transaction,
    );

    await replaceSurveyQuestions(
      id,
      source.questions.map((question) => ({
        type: question.type,
        textRu: question.textRu,
        textUz: question.textUz,
        required: question.required,
        allowOwnAnswer: question.allowOwnAnswer,
        options: question.options.map((option) => ({
          textRu: option.textRu,
          textUz: option.textUz,
          exclusive: option.exclusive,
        })),
      })),
      transaction,
    );

    return id;
  });

  log.info('опрос скопирован в черновик', { surveyId, copyId, createdById });

  return readSurvey(copyId);
};
