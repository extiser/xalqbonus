import { consola } from 'consola';
import { db } from '#server/db';
import {
  findSurveyResponse,
  listSurveyAnswers,
  lockSurveyResponse,
  markSurveyCompleted,
  markSurveyStarted,
  replaceSurveyAnswer,
  type SurveyAnswerRow,
  type SurveyAnswerWrite,
} from '#server/repositories/surveyResponses';
import {
  listSurveyOptions,
  listSurveyQuestions,
  type SurveyOptionRow,
  type SurveyQuestionRow,
} from '#server/repositories/surveys';
import type { LinkedDriver } from '#server/services/drivers/readLinkedDriver';
import { awardSurveyPoints } from '#server/services/points/awardSurveyPoints';
import { isSurveyClosed } from '#server/services/surveys/closed';
import { SurveyAnswerInvalidError } from '#server/services/surveys/errors';
import {
  findAvailableSurvey,
  presentMemberSurvey,
  readSurveyFinishPoints,
} from '#server/services/surveys/memberSurveyScreen';
import type { MemberSurveyAnswer, MiniAppSurveyResponse } from '#shared/types/memberSurvey';

/**
 * Ответ на вопрос опроса — по одному, при переходе к следующему вопросу (issue #323).
 *
 * Ответ заменяет прежний, пока опрос не пройден. Первый ответ ставит `started_at`. Ответ
 * на последний вопрос, когда у всех обязательных есть значение, проходит опрос — в той же
 * транзакции:
 *
 * 1. `completed_at` — условием «ещё пусто»;
 * 2. `awardSurveyPoints`.
 *
 * Отметка без баллов дала бы пройденный опрос без награды, баллы без отметки — опрос,
 * недопройденный с виду, но уже оплаченный. Повтор завершения — второе «Далее» на последнем
 * вопросе — отвечает финалом с той же суммой и баллы не зовёт: сумма читается из журнала.
 *
 * После `completed_at` ответы не меняются: отправка отвечает финалом. Опрос, закрытый по сроку,
 * ответов не принимает и не завершается: отправка отвечает экраном «опрос закрыт», баллов нет.
 *
 * Опроса нет или он недоступен — `{ survey: null }`, как у чтения.
 */

const log = consola.withTag('surveys:answer');

/** Предел свободного ответа и «Своего варианта» — тот же, что проверка в миграции. */
const TEXT_LIMIT = 300;

/** Пустое и пробелы — то же, что ответа нет: в базе пусто пишется только `NULL`. */
const normalizeText = (value: string | null): string | null => {
  const trimmed = value?.trim() ?? '';

  if (trimmed === '') {
    return null;
  }

  if (trimmed.length > TEXT_LIMIT) {
    throw new SurveyAnswerInvalidError('text_length');
  }

  return trimmed;
};

const hasValue = (answer: Pick<SurveyAnswerRow, 'optionIds' | 'ownText' | 'textValue' | 'scaleValue'>): boolean =>
  answer.optionIds.length > 0 || answer.ownText !== null || answer.textValue !== null || answer.scaleValue !== null;

/**
 * Значение ответа по типу вопроса — или `SurveyAnswerInvalidError`. Тип вопроса лежит в соседней
 * таблице, и `CHECK` миграции его не видит: соответствие держит этот разбор.
 */
const readAnswerValue = (
  question: SurveyQuestionRow,
  questionOptions: SurveyOptionRow[],
  body: MemberSurveyAnswer,
): Omit<SurveyAnswerWrite, 'surveyId' | 'personId' | 'questionId'> => {
  const ownText = normalizeText(body.ownText);
  const textValue = normalizeText(body.textValue);
  const optionIds = [...new Set(body.optionIds)];
  const chosen = optionIds.map((optionId) => {
    const option = questionOptions.find((candidate) => candidate.id === optionId);

    if (!option) {
      throw new SurveyAnswerInvalidError('option');
    }

    return option;
  });

  let value: Omit<SurveyAnswerWrite, 'surveyId' | 'personId' | 'questionId'>;

  if (question.type === 'single' || question.type === 'multiple') {
    if (textValue !== null || body.scaleValue !== null) {
      throw new SurveyAnswerInvalidError('value_type');
    }

    if (ownText !== null && !question.allowOwnAnswer) {
      throw new SurveyAnswerInvalidError('own_answer');
    }

    // Один ответ — ровно одно из двух: вариант или свой.
    if (question.type === 'single' && chosen.length + (ownText === null ? 0 : 1) > 1) {
      throw new SurveyAnswerInvalidError('single_choice');
    }

    // Исключающий — только один и без соседей: ни других вариантов, ни своего ответа.
    if (chosen.some((option) => option.exclusive) && (chosen.length > 1 || ownText !== null)) {
      throw new SurveyAnswerInvalidError('exclusive');
    }

    value = { optionIds: chosen.map((option) => option.id), ownText, textValue: null, scaleValue: null };
  } else if (question.type === 'text') {
    if (chosen.length > 0 || ownText !== null || body.scaleValue !== null) {
      throw new SurveyAnswerInvalidError('value_type');
    }

    value = { optionIds: [], ownText: null, textValue, scaleValue: null };
  } else {
    if (chosen.length > 0 || ownText !== null || textValue !== null) {
      throw new SurveyAnswerInvalidError('value_type');
    }

    if (body.scaleValue !== null && (!Number.isInteger(body.scaleValue) || body.scaleValue < 1 || body.scaleValue > 5)) {
      throw new SurveyAnswerInvalidError('scale_value');
    }

    value = { optionIds: [], ownText: null, textValue: null, scaleValue: body.scaleValue };
  }

  // Пропустить можно только необязательный: «Далее» обязательного без ответа погашено.
  if (question.required && !hasValue(value)) {
    throw new SurveyAnswerInvalidError('required');
  }

  return value;
};

export const saveMemberSurveyAnswer = async (
  driver: LinkedDriver,
  surveyId: string,
  body: MemberSurveyAnswer,
  now: Date,
): Promise<MiniAppSurveyResponse> =>
  db.$transaction(async (transaction) => {
    const survey = await findAvailableSurvey(surveyId, driver, transaction);

    if (!survey) {
      return { survey: null };
    }

    // По очереди, а не `Promise.all`: у транзакции одно соединение, и запросы на нём всё равно
    // идут друг за другом.
    const questions = await listSurveyQuestions(surveyId, transaction);
    const options = await listSurveyOptions(surveyId, transaction);

    const present = async (stage: 'questions' | 'finish' | 'closed', finishPoints: number) => ({
      survey: presentMemberSurvey({
        survey,
        questions,
        options,
        finishPoints,
        stage,
        answers: await listSurveyAnswers(surveyId, driver.personId, transaction),
        language: driver.language,
      }),
    });

    // Пройденный и закрытый проверяются до блокировки: блокировка заводит строку прохождения,
    // а по закрытому опросу не пишется ничего.
    const before = await findSurveyResponse(surveyId, driver.personId, transaction);

    if (before?.completedAt) {
      return present('finish', await readSurveyFinishPoints(survey, driver.personId, transaction));
    }

    if (isSurveyClosed(survey.endsOn, now)) {
      return present('closed', survey.points);
    }

    // Под блокировкой — заново: второе «Далее» на последнем вопросе ждало здесь первое
    // и видит опрос уже пройденным.
    const response = await lockSurveyResponse(surveyId, driver.personId, transaction);

    if (response.completedAt) {
      return present('finish', await readSurveyFinishPoints(survey, driver.personId, transaction));
    }

    const questionIndex = questions.findIndex((question) => question.id === body.questionId);
    const question = questions[questionIndex];

    if (!question) {
      throw new SurveyAnswerInvalidError('question');
    }

    const value = readAnswerValue(
      question,
      options.filter((option) => option.questionId === question.id),
      body,
    );

    await replaceSurveyAnswer(
      { surveyId, personId: driver.personId, questionId: question.id, ...value },
      transaction,
    );
    await markSurveyStarted(surveyId, driver.personId, transaction);

    const isLast = questionIndex === questions.length - 1;

    if (!isLast) {
      return present('questions', survey.points);
    }

    // Опрос пройден, когда ответ на последний вопрос сохранён и у всех обязательных есть
    // значение. Обязательный без значения сюда доходит только мимо экрана — опрос остаётся
    // начатым, и экран откроет первый вопрос без ответа.
    const answers = await listSurveyAnswers(surveyId, driver.personId, transaction);
    const complete = questions
      .filter((candidate) => candidate.required)
      .every((candidate) => answers.some((answer) => answer.questionId === candidate.id && hasValue(answer)));

    if (!complete) {
      return present('questions', survey.points);
    }

    if (!(await markSurveyCompleted(surveyId, driver.personId, now, transaction))) {
      return present('finish', await readSurveyFinishPoints(survey, driver.personId, transaction));
    }

    const award = await awardSurveyPoints({
      surveyId,
      personId: driver.personId,
      occurredAt: now,
      client: transaction,
    });

    log.info('водитель прошёл опрос', { surveyId, personId: driver.personId, points: award.points });

    return present('finish', award.points);
  });
