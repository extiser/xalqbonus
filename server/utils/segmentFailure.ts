import { createError, type H3Error } from 'h3';

import {
  EmptySegmentConditionsError,
  InvalidSegmentFieldsError,
  SegmentSurveyDemoMismatchError,
  SegmentSurveyNotFrozenError,
  SegmentSurveyUnknownError,
  UnknownSegmentError,
  type SegmentFieldProblem,
} from '#server/services/segments/errors';
import { SEGMENT_EMPTY_CONDITIONS_TEXT } from '#shared/segment';

/**
 * Что ответить сотруднику на доменный отказ ручки сегментов.
 *
 * Отказы — строками при своих правилах, а не кодами словаря двери: они про предмет разговора,
 * а не про доступ (docs/decisions.md → «Отказ двери веба говорит кодом, а текст живёт
 * словарём»). Собраны в одном месте, как у рассылок: ручек восемь, а отказов на всех один
 * набор.
 *
 * `null` — не отказ, а поломка: такое уходит пятисоткой.
 */

const FIELD_PROBLEM_TEXT: Record<SegmentFieldProblem, string> = {
  name_missing: 'Нужно имя сегмента.',
  bound_not_integer: 'Границы условий — целые числа.',
  days_negative: 'Дни с последней поездки не бывают меньше нуля.',
  days_reversed: 'Дни с последней поездки: «от» больше, чем «до» — под такое не подойдёт никто.',
  balance_reversed: 'Баланс: «от» больше, чем «до» — под такое не подойдёт никто.',
  flag_invalid: 'Признак участия и привязки — «да», «нет» или «не важно».',
  survey_invalid: 'Опрос условия не похож на ссылку на опрос.',
  survey_state_invalid: 'Условие по опросу — «получил, но не прошёл» или «отказался».',
  survey_incomplete: 'Условие по опросу задаётся опросом и значением вместе.',
};

export const explainSegmentFailure = (error: unknown): H3Error | null => {
  if (error instanceof UnknownSegmentError) {
    return createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Такого сегмента нет.' });
  }

  if (error instanceof EmptySegmentConditionsError) {
    return createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: SEGMENT_EMPTY_CONDITIONS_TEXT,
    });
  }

  if (error instanceof SegmentSurveyUnknownError) {
    return createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Такого опроса нет.' });
  }

  if (error instanceof SegmentSurveyDemoMismatchError) {
    return createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      message: error.segmentIsDemo
        ? 'В условие демо-сегмента выбирается только демо-опрос.'
        : 'В условие живого сегмента не выбирается демо-опрос.',
    });
  }

  if (error instanceof SegmentSurveyNotFrozenError) {
    return createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      message: 'Опрос ещё черновик: он ни разу не уходил рассылкой, и по нему не выберется никто.',
    });
  }

  if (error instanceof InvalidSegmentFieldsError) {
    return createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: FIELD_PROBLEM_TEXT[error.problem],
    });
  }

  return null;
};

/** Отказ в человеческом виде или исходная ошибка — для `catch` в ручке. */
export const rethrowSegmentFailure = (error: unknown): never => {
  throw explainSegmentFailure(error) ?? error;
};
