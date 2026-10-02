import type { SurveyFormFields } from '~/types/surveyForm';
import { SURVEY_TEXT_FIELDS, surveyQuestionHasOptions } from '#shared/survey';
import type { Survey, SurveyContentInput, SurveyTextField } from '#shared/types/survey';

/**
 * Перевод опроса между ответом ручки, полями экрана и телом правки (issue #320).
 */

/** Ключ новой строки экрана. Счётчиком: ключу нужна только уникальность на странице. */
let nextKey = 0;

export const newSurveyFormKey = (): string => {
  nextKey += 1;

  return `new-${nextKey}`;
};

export const toSurveyFormFields = (survey: Survey | null): SurveyFormFields => {
  const texts = Object.fromEntries(
    SURVEY_TEXT_FIELDS.map((field) => [field, survey?.[field] ?? '']),
  ) as Record<SurveyTextField, string>;

  return {
    ...texts,
    title: survey?.title ?? '',
    endsOn: survey?.endsOn ?? '',
    points: survey ? String(survey.points) : '0',
    questions: (survey?.questions ?? []).map((question) => ({
      key: question.questionId,
      type: question.type,
      textRu: question.textRu ?? '',
      textUz: question.textUz ?? '',
      required: question.required,
      allowOwnAnswer: question.allowOwnAnswer,
      options: question.options.map((option) => ({
        key: option.optionId,
        textRu: option.textRu ?? '',
        textUz: option.textUz ?? '',
        exclusive: option.exclusive,
      })),
    })),
  };
};

/**
 * Содержимое для ручки. Варианты уходят только у вопросов с выбором; пустые баллы — ноль:
 * черновик сохраняется и недописанным, а «без награды» и есть ноль.
 *
 * Галочки уходят только там, где тип их допускает (issue #335): «Свой вариант» — у вопросов
 * с выбором, «Исключающий» — у `multiple`. На экране они остаются — смена типа туда
 * и обратно их не теряет, как не теряет вариантов.
 */
export const toSurveyContentInput = (fields: SurveyFormFields): SurveyContentInput => {
  const texts = Object.fromEntries(
    SURVEY_TEXT_FIELDS.map((field) => [field, fields[field]]),
  ) as Record<SurveyTextField, string>;

  return {
    ...texts,
    points: fields.points.trim() === '' ? 0 : Number(fields.points),
    questions: fields.questions.map((question) => ({
      type: question.type,
      textRu: question.textRu,
      textUz: question.textUz,
      required: question.required,
      allowOwnAnswer: surveyQuestionHasOptions(question.type) && question.allowOwnAnswer,
      options: surveyQuestionHasOptions(question.type)
        ? question.options.map((option) => ({
            textRu: option.textRu,
            textUz: option.textUz,
            exclusive: question.type === 'multiple' && option.exclusive,
          }))
        : [],
    })),
  };
};
