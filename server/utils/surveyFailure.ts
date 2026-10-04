import { createError, type H3Error } from 'h3';

import {
  SurveyAttachedError,
  SurveyEndsOnPastError,
  SurveyFinishedError,
  SurveyFrozenError,
  SurveyFrozenFieldRequiredError,
  SurveyNotFinishableError,
  SurveyNotFrozenForSegmentError,
  SurveyRequestInvalidError,
  SurveySegmentEmptyError,
  UnknownSurveyError,
  type SurveyRequestInvalidReason,
} from '#server/services/surveys/errors';

/**
 * Что ответить сотруднику на доменный отказ ручки опросов.
 *
 * Отказы — строками при своих правилах, а не кодами словаря двери: они про предмет разговора,
 * а не про доступ (docs/decisions.md → «Отказ двери веба говорит кодом, а текст живёт
 * словарём»). Собраны в одном месте, как у рассылок: ручек несколько, отказов на всех один набор.
 *
 * `null` — не отказ, а поломка: такое уходит пятисоткой.
 */

const FROZEN_TEXT = {
  update:
    'Опрос заморожен: после отправки рассылки правятся только название и дата окончания. Остальное — копией.',
  delete: 'Удаляется только черновик. Этот опрос уже ушёл рассылкой.',
} as const;

const FROZEN_FIELD_TEXT = {
  title: 'У ушедшего опроса название обязательно.',
  endsOn: 'У ушедшего опроса дата окончания обязательна.',
} as const;

const FINISHED_TEXT = {
  finish: 'Опрос уже завершён.',
  ends_on: 'Опрос завершён досрочно — последний день у него не правится.',
} as const;

const NOT_FINISHABLE_TEXT = {
  draft: 'Завершается только опрос, ушедший рассылкой. Черновик никуда не уходил.',
  closed: 'Опрос уже закрыт по сроку.',
} as const;

const INVALID_TEXT: Record<SurveyRequestInvalidReason, string> = {
  ends_on: 'Дата окончания — день в виде ГГГГ-ММ-ДД.',
  points: 'Баллы — целое число, не меньше нуля.',
  content: 'Опрос пришёл в непонятном виде.',
  question_type: 'Тип вопроса — один ответ, несколько ответов, шкала или свободный текст.',
  question_options: 'Варианты бывают только у вопросов с одним или несколькими ответами.',
  question_own_answer: '«Свой вариант» бывает только у вопросов с одним или несколькими ответами.',
  option_exclusive: 'Исключающий вариант бывает только у вопроса с несколькими ответами.',
  survey_group: 'Группа итогов — «не прошли», «отказались» или «прошли».',
};

/** `field` — поле формы, у которого встаёт текст отказа (`failureField` на клиенте). */
const reject = (
  statusCode: 400 | 404 | 409,
  statusMessage: string,
  message: string,
  field?: 'endsOn',
): H3Error =>
  createError({ statusCode, statusMessage, message, data: field ? { field } : undefined });

export const explainSurveyFailure = (error: unknown): H3Error | null => {
  if (error instanceof UnknownSurveyError) {
    return reject(404, 'Not Found', 'Такого опроса нет.');
  }

  if (error instanceof SurveyFrozenError) {
    return reject(409, 'Conflict', FROZEN_TEXT[error.action]);
  }

  if (error instanceof SurveyAttachedError) {
    return reject(
      409,
      'Conflict',
      'Опрос прикреплён к черновику рассылки — сначала открепите его там.',
    );
  }

  if (error instanceof SurveyFrozenFieldRequiredError) {
    return reject(400, 'Bad Request', FROZEN_FIELD_TEXT[error.field]);
  }

  if (error instanceof SurveyEndsOnPastError) {
    return reject(
      400,
      'Bad Request',
      'Последний день не может быть в прошлом. Чтобы закрыть опрос сейчас — «Завершить опрос».',
      'endsOn',
    );
  }

  if (error instanceof SurveyFinishedError) {
    return reject(
      409,
      'Conflict',
      FINISHED_TEXT[error.action],
      error.action === 'ends_on' ? 'endsOn' : undefined,
    );
  }

  if (error instanceof SurveyNotFinishableError) {
    return reject(409, 'Conflict', NOT_FINISHABLE_TEXT[error.reason]);
  }

  if (error instanceof SurveyNotFrozenForSegmentError) {
    return reject(409, 'Conflict', 'Опрос ещё не уходил рассылкой — итогов нет.');
  }

  if (error instanceof SurveySegmentEmptyError) {
    return reject(409, 'Conflict', 'В этой группе никого нет — сегмент не заведён.');
  }

  if (error instanceof SurveyRequestInvalidError) {
    return reject(400, 'Bad Request', INVALID_TEXT[error.reason]);
  }

  return null;
};

/** Отказ в человеческом виде или исходная ошибка — для `catch` в ручке. */
export const rethrowSurveyFailure = (error: unknown): never => {
  throw explainSurveyFailure(error) ?? error;
};
