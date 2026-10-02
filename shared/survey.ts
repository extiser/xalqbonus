import type { SurveyQuestionType } from '../server/generated/prisma/enums';
import type { SurveyTextField } from './types/survey';

/**
 * Правила опроса, общие для сервера и экрана (issue #320).
 */

/** Типы вопросов в том порядке, в каком их предлагает форма. */
export const SURVEY_QUESTION_TYPES: readonly SurveyQuestionType[] = ['single', 'multiple', 'scale', 'text'];

/** Есть ли у вопроса этого типа варианты. У шкалы значения 1–5 фиксированы, у текста их нет. */
export const surveyQuestionHasOptions = (type: SurveyQuestionType): boolean =>
  type === 'single' || type === 'multiple';

/** Тексты экранов опроса — порядок полей формы и списка причин. */
export const SURVEY_TEXT_FIELDS: readonly SurveyTextField[] = [
  'introRu',
  'introUz',
  'finishRu',
  'finishUz',
  'declineButtonRu',
  'declineButtonUz',
  'appButtonRu',
  'appButtonUz',
];

/** Как поле называется в причине: «Нет текста: вступление на узбекском». */
export const SURVEY_TEXT_FIELD_LABELS: Readonly<Record<SurveyTextField, string>> = {
  introRu: 'вступление на русском',
  introUz: 'вступление на узбекском',
  finishRu: 'финал на русском',
  finishUz: 'финал на узбекском',
  declineButtonRu: 'кнопка отказа на русском',
  declineButtonUz: 'кнопка отказа на узбекском',
  appButtonRu: 'кнопка перехода в приложение на русском',
  appButtonUz: 'кнопка перехода в приложение на узбекском',
};

/**
 * Что проверяет полнота: опрос — с сервера, где пусто это `null`, или с экрана, где пусто
 * это пустая строка.
 */
export type SurveyCompletenessFields = Record<SurveyTextField, string | null> & {
  title: string | null;
  endsOn: string | null;
  questions: {
    type: SurveyQuestionType;
    textRu: string | null;
    textUz: string | null;
    options: { textRu: string | null; textUz: string | null }[];
  }[];
};

export type SurveyFreezeProblem =
  | { kind: 'missing_title' }
  | { kind: 'missing_ends_on' }
  | { kind: 'missing_text'; field: SurveyTextField }
  | { kind: 'no_questions' }
  /** Номер вопроса — с единицы, как на экране. */
  | { kind: 'question_text'; question: number }
  | { kind: 'question_options'; question: number }
  | { kind: 'option_text'; question: number; option: number };

const isBlank = (value: string | null): boolean => value === null || value.trim() === '';

/**
 * Чего не хватает опросу, чтобы его заморозить, — все причины сразу. Пустой список — полон.
 *
 * Заморозка требует все тексты на обоих языках: опрос — не объявление, и вопрос без перевода
 * половина водителей не прочитает. Того же требует база (`surveys_frozen_complete_check`
 * и триггер `surveys_frozen_questions`), здесь — чтобы назвать причины словами: экран
 * показывает их у черновика, отказ запуска рассылки с опросом называет их теми же фразами.
 */
export const surveyFreezeProblems = (fields: SurveyCompletenessFields): SurveyFreezeProblem[] => {
  const problems: SurveyFreezeProblem[] = [];

  if (isBlank(fields.title)) {
    problems.push({ kind: 'missing_title' });
  }

  if (isBlank(fields.endsOn)) {
    problems.push({ kind: 'missing_ends_on' });
  }

  for (const field of SURVEY_TEXT_FIELDS) {
    if (isBlank(fields[field])) {
      problems.push({ kind: 'missing_text', field });
    }
  }

  if (fields.questions.length === 0) {
    problems.push({ kind: 'no_questions' });
  }

  fields.questions.forEach((question, questionIndex) => {
    const number = questionIndex + 1;

    if (isBlank(question.textRu) || isBlank(question.textUz)) {
      problems.push({ kind: 'question_text', question: number });
    }

    if (!surveyQuestionHasOptions(question.type)) {
      return;
    }

    if (question.options.length === 0) {
      problems.push({ kind: 'question_options', question: number });
    }

    question.options.forEach((option, optionIndex) => {
      if (isBlank(option.textRu) || isBlank(option.textUz)) {
        problems.push({ kind: 'option_text', question: number, option: optionIndex + 1 });
      }
    });
  });

  return problems;
};

export const surveyFreezeProblemText = (problem: SurveyFreezeProblem): string => {
  switch (problem.kind) {
    case 'missing_title':
      return 'Нет названия.';
    case 'missing_ends_on':
      return 'Нет даты окончания.';
    case 'missing_text':
      return `Нет текста: ${SURVEY_TEXT_FIELD_LABELS[problem.field]}.`;
    case 'no_questions':
      return 'Нет ни одного вопроса.';
    case 'question_text':
      return `Вопрос ${problem.question}: нужен текст на обоих языках.`;
    case 'question_options':
      return `Вопрос ${problem.question}: нет вариантов ответа.`;
    case 'option_text':
      return `Вопрос ${problem.question}, вариант ${problem.option}: нужен текст на обоих языках.`;
  }
};
