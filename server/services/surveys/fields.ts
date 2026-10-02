import type {
  SurveyContentRowInput,
  SurveyListRow,
  SurveyOptionRow,
  SurveyQuestionInsert,
  SurveyQuestionRow,
  SurveyRow,
  SurveySettingsInput,
} from '#server/repositories/surveys';
import { isSurveyClosed } from '#server/services/surveys/closed';
import { SurveyRequestInvalidError } from '#server/services/surveys/errors';
import {
  SURVEY_QUESTION_TYPES,
  SURVEY_TEXT_FIELDS,
  surveyQuestionHasOptions,
} from '#shared/survey';
import type { Survey, SurveyListItem, SurveyQuestionType, SurveyTextField } from '#shared/types/survey';

/**
 * Перевод между строками базы, контрактом ручки и полями формы. Операцией не является
 * и поэтому лежит отдельным файлом: нужен он всем ручкам опросов сразу.
 */

export const toSurvey = (
  row: SurveyRow,
  questions: SurveyQuestionRow[],
  options: SurveyOptionRow[],
  moment: Date,
): Survey => ({
  surveyId: row.id,
  title: row.title,
  introRu: row.introRu,
  introUz: row.introUz,
  finishRu: row.finishRu,
  finishUz: row.finishUz,
  declineButtonRu: row.declineButtonRu,
  declineButtonUz: row.declineButtonUz,
  appButtonRu: row.appButtonRu,
  appButtonUz: row.appButtonUz,
  points: row.points,
  endsOn: row.endsOn,
  frozenAt: row.frozenAt?.toISOString() ?? null,
  closed: isSurveyClosed(row.endsOn, moment),
  isDemo: row.isDemo,
  createdByName: row.createdByName,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  questions: questions.map((question) => ({
    questionId: question.id,
    type: question.type,
    textRu: question.textRu,
    textUz: question.textUz,
    required: question.required,
    allowOwnAnswer: question.allowOwnAnswer,
    options: options
      .filter((option) => option.questionId === question.id)
      .map((option) => ({
        optionId: option.id,
        textRu: option.textRu,
        textUz: option.textUz,
        exclusive: option.exclusive,
      })),
  })),
});

export const toSurveyListItem = (row: SurveyListRow, moment: Date): SurveyListItem => ({
  surveyId: row.id,
  title: row.title,
  questionCount: row.questionCount,
  points: row.points,
  endsOn: row.endsOn,
  frozenAt: row.frozenAt?.toISOString() ?? null,
  closed: isSurveyClosed(row.endsOn, moment),
  isDemo: row.isDemo,
  createdByName: row.createdByName,
  createdAt: row.createdAt.toISOString(),
});

/** Содержимое опроса — то, что замораживается: тексты, баллы, вопросы с вариантами. */
export type SurveyContent = SurveyContentRowInput & {
  questions: SurveyQuestionInsert[];
};

/**
 * Разобранное тело заведения и правки. `content` пусто — тело несёт только название и срок:
 * так правится замороженный опрос.
 */
export type SurveyRequest = {
  settings: SurveySettingsInput;
  content: SurveyContent | null;
};

/** Тело заведения и правки так, как его видит разбор: всё `unknown`, пришло от клиента. */
export type SurveyRequestFields = {
  title?: unknown;
  endsOn?: unknown;
  content?: unknown;
  /** Только у заведения: правка признак не трогает (issue #212). */
  isDemo?: unknown;
};

/** Предел колонки `integer`: больше база не примет, и отказ лучше сказать до неё. */
const POINTS_MAX = 2_147_483_647;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Строка поля, обрезанная по краям. Пустое и не строка — `null`: пусто пишется одним способом. */
const readText = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value.trim() : '';

  return text === '' ? null : text;
};

/** День `YYYY-MM-DD` или пусто. Строка, не похожая на существующий день, — отказ. */
const readDay = (value: unknown): string | null => {
  const text = readText(value);

  if (text === null) {
    return null;
  }

  // `2026-02-30` разбирается датой 2 марта: настоящий день читается обратно тем же.
  if (!DAY_PATTERN.test(text) || new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) !== text) {
    throw new SurveyRequestInvalidError('ends_on');
  }

  return text;
};

const readPoints = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > POINTS_MAX) {
    throw new SurveyRequestInvalidError('points');
  }

  return value;
};

const isQuestionType = (value: unknown): value is SurveyQuestionType =>
  typeof value === 'string' && (SURVEY_QUESTION_TYPES as readonly string[]).includes(value);

const readQuestion = (value: unknown): SurveyQuestionInsert => {
  if (
    !isRecord(value) ||
    typeof value.required !== 'boolean' ||
    typeof value.allowOwnAnswer !== 'boolean' ||
    !Array.isArray(value.options)
  ) {
    throw new SurveyRequestInvalidError('content');
  }

  if (!isQuestionType(value.type)) {
    throw new SurveyRequestInvalidError('question_type');
  }

  // У шкалы и текста вариантов нет: пришедшие с ними — чужой клиент, а не черновик.
  if (!surveyQuestionHasOptions(value.type) && value.options.length > 0) {
    throw new SurveyRequestInvalidError('question_options');
  }

  // «Свой вариант» — ответ рядом с вариантами: у шкалы и текста ему не к чему встать.
  // Того же требует база (`survey_questions_own_answer_check`), здесь — чтобы сказать словами.
  if (!surveyQuestionHasOptions(value.type) && value.allowOwnAnswer) {
    throw new SurveyRequestInvalidError('question_own_answer');
  }

  const type = value.type;

  return {
    type,
    textRu: readText(value.textRu),
    textUz: readText(value.textUz),
    required: value.required,
    allowOwnAnswer: value.allowOwnAnswer,
    options: value.options.map((option) => {
      if (!isRecord(option) || typeof option.exclusive !== 'boolean') {
        throw new SurveyRequestInvalidError('content');
      }

      // Исключающий снимает остальные отметки — у одного ответа отметка и так одна. База
      // этого не держит: тип вопроса в соседней таблице, `CHECK` его не видит.
      if (option.exclusive && type !== 'multiple') {
        throw new SurveyRequestInvalidError('option_exclusive');
      }

      return {
        textRu: readText(option.textRu),
        textUz: readText(option.textUz),
        exclusive: option.exclusive,
      };
    }),
  };
};

const readContent = (value: unknown): SurveyContent | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (!isRecord(value) || !Array.isArray(value.questions)) {
    throw new SurveyRequestInvalidError('content');
  }

  const texts = Object.fromEntries(
    SURVEY_TEXT_FIELDS.map((field) => [field, readText(value[field])]),
  ) as Record<SurveyTextField, string | null>;

  return {
    ...texts,
    points: readPoints(value.points),
    questions: value.questions.map(readQuestion),
  };
};

/**
 * Поля из тела запроса. Обязательных у черновика нет: он заводится первым набранным символом
 * (issue #148), и чего не хватает для заморозки, решает заморозка.
 */
export const readSurveyRequest = (body: SurveyRequestFields | null | undefined): SurveyRequest => ({
  settings: {
    title: readText(body?.title),
    endsOn: readDay(body?.endsOn),
  },
  content: readContent(body?.content),
});

/** Пустое содержимое — заведение черновика первым набранным названием. */
export const EMPTY_SURVEY_CONTENT: SurveyContent = {
  introRu: null,
  introUz: null,
  finishRu: null,
  finishUz: null,
  declineButtonRu: null,
  declineButtonUz: null,
  appButtonRu: null,
  appButtonUz: null,
  points: 0,
  questions: [],
};
