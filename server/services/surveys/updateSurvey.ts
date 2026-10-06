import { db } from '#server/db';
import {
  lockSurvey,
  replaceSurveyQuestions,
  updateDraftSurveyContent,
  updateSurveySettings,
} from '#server/repositories/surveys';
import { assertSurveyEndsOnNotPast } from '#server/services/surveys/closed';
import {
  SurveyFinishedError,
  SurveyFrozenError,
  SurveyFrozenFieldRequiredError,
  UnknownSurveyError,
} from '#server/services/surveys/errors';
import type { SurveyRequest } from '#server/services/surveys/fields';
import { readSurvey } from '#server/services/surveys/readSurvey';
import type { Survey } from '#shared/types/survey';

/**
 * Правка опроса. Черновик правится целиком — им сохраняет себя форма по мере набора.
 *
 * Замороженный — только название и дата окончания: служебное название ответы не трогает,
 * а срок может понадобиться продлить. Содержимое — тексты, баллы, вопросы, варианты, типы,
 * обязательность — не правится: ответы до и после правки несравнимы.
 * Отказ даёт сервис, а не только серая форма.
 *
 * Последний день — не в прошлом, если его меняют (issue #348): закрыть опрос сейчас можно
 * только кнопкой «Завершить опрос». У завершённого досрочно последний день не правится вовсе —
 * опрос уже закрыт, и срок у него ничего не решает. Название правится и у завершённого.
 *
 * Всё под блокировкой строки опроса: заморозку ставит запуск рассылки той же строкой,
 * и правка, проверившая признак до запуска, иначе записала бы содержимое после него.
 */
export const updateSurvey = async (surveyId: string, request: SurveyRequest): Promise<Survey> => {
  await db.$transaction(async (transaction) => {
    const current = await lockSurvey(surveyId, transaction);

    if (!current) {
      throw new UnknownSurveyError(surveyId);
    }

    if (current.frozen) {
      if (request.content !== null) {
        throw new SurveyFrozenError(surveyId, 'update');
      }

      if (request.settings.title === null) {
        throw new SurveyFrozenFieldRequiredError(surveyId, 'title');
      }

      if (request.settings.endsOn === null) {
        throw new SurveyFrozenFieldRequiredError(surveyId, 'endsOn');
      }
    }

    if (current.finishedAt !== null && request.settings.endsOn !== current.endsOn) {
      throw new SurveyFinishedError(surveyId, 'ends_on');
    }

    assertSurveyEndsOnNotPast(request.settings.endsOn, current.endsOn, new Date());

    await updateSurveySettings(surveyId, request.settings, transaction);

    if (request.content === null) {
      return;
    }

    const { questions, ...content } = request.content;

    // Под блокировкой выше опрос заморозиться не мог; условие в `UPDATE` — вторая страховка.
    if (!(await updateDraftSurveyContent(surveyId, content, transaction))) {
      throw new SurveyFrozenError(surveyId, 'update');
    }

    await replaceSurveyQuestions(surveyId, questions, transaction);
  });

  return readSurvey(surveyId);
};
