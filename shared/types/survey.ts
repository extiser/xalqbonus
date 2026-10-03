/**
 * Контракт ручек опросов (issue #320).
 *
 * Типы лежат в `shared/`, потому что у них два потребителя — обработчик и разметка.
 * Времена уезжают строками ISO-8601, дата окончания — днём `YYYY-MM-DD`, незаполненное
 * поле — `null`.
 */

import type { SurveyQuestionType } from '../../server/generated/prisma/enums';

export type { SurveyQuestionType };

/**
 * Тексты экранов опроса на обоих языках. Пусто бывает только у черновика: замороженный
 * опрос полон (`shared/survey.ts` → `surveyFreezeProblems`).
 */
export type SurveyTexts = {
  /** Экран открытия опроса. */
  introRu: string | null;
  introUz: string | null;
  /** Экран финала. */
  finishRu: string | null;
  finishUz: string | null;
  /** Кнопка отказа на экране открытия. */
  declineButtonRu: string | null;
  declineButtonUz: string | null;
  /** Кнопка перехода в приложение на финале. */
  appButtonRu: string | null;
  appButtonUz: string | null;
};

export type SurveyTextField = keyof SurveyTexts;

/** Вариант ответа — только у `single` и `multiple`. */
export type SurveyOption = {
  optionId: string;
  textRu: string | null;
  textUz: string | null;
  /** Исключающий — отметка снимает остальные (issue #335). Бывает только у `multiple`. */
  exclusive: boolean;
};

export type SurveyQuestion = {
  questionId: string;
  type: SurveyQuestionType;
  textRu: string | null;
  textUz: string | null;
  required: boolean;
  /** «Свой вариант» — ответ своими словами (issue #335). Бывает только у `single` и `multiple`. */
  allowOwnAnswer: boolean;
  /** По порядку. У `text` и `scale` пусто всегда. */
  options: SurveyOption[];
};

export type Survey = SurveyTexts & {
  surveyId: string;
  /** Служебное название для списка. Пусто только у черновика. */
  title: string | null;
  /** Баллы за пройденный опрос. Ноль — без награды. */
  points: number;
  /** Последний день опроса, `YYYY-MM-DD`. Пусто только у черновика. */
  endsOn: string | null;
  /**
   * Когда заморожен. Пусто — черновик, правится целиком. У замороженного правятся только
   * название и дата окончания.
   */
  frozenAt: string | null;
  /**
   * Закрыт: срок прошёл — по Ташкенту уже следующий день после `endsOn`, — или опрос завершён
   * досрочно (`finishedAt`).
   */
  closed: boolean;
  /** Завершён досрочно кнопкой «Завершить опрос» (issue #348). Пусто — не завершался. */
  finishedAt: string | null;
  /** Кто завершил. Заполнено ровно тогда, когда `finishedAt`. */
  finishedByName: string | null;
  /** Демо-опрос: ставится при заведении и не меняется, копия наследует. */
  isDemo: boolean;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  /** По порядку. */
  questions: SurveyQuestion[];
};

/** Строка списка: без текстов и вопросов — только их число. */
export type SurveyListItem = Pick<
  Survey,
  | 'surveyId'
  | 'title'
  | 'points'
  | 'endsOn'
  | 'frozenAt'
  | 'closed'
  | 'finishedAt'
  | 'isDemo'
  | 'createdByName'
  | 'createdAt'
> & {
  questionCount: number;
};

export type SurveyListResponse = {
  surveys: SurveyListItem[];
};

export type SurveyResponse = {
  survey: Survey;
};

/** Вопрос так, как его прислала форма. Пустой текст — пустая строка. */
export type SurveyQuestionInput = {
  type: SurveyQuestionType;
  textRu: string;
  textUz: string;
  required: boolean;
  /** `true` — только у `single` и `multiple`. */
  allowOwnAnswer: boolean;
  /** Только у `single` и `multiple`; у остальных — пустой список. `exclusive: true` — только у `multiple`. */
  options: { textRu: string; textUz: string; exclusive: boolean }[];
};

/**
 * Содержимое опроса — всё, что замораживается: тексты, баллы, вопросы и варианты. Вопросы
 * приходят целиком и по порядку: черновик хранит ровно то, что на экране.
 */
export type SurveyContentInput = Record<SurveyTextField, string> & {
  points: number;
  questions: SurveyQuestionInput[];
};

/**
 * Тело правки. Название и дата окончания правятся всегда, содержимое — только у черновика:
 * замороженный опрос присылает тело без `content`, а с ним получает отказ.
 */
export type SurveyRequestBody = {
  title: string;
  /** `YYYY-MM-DD` или пустая строка. */
  endsOn: string;
  content?: SurveyContentInput;
};

/** Тело заведения: то же и признак демо — только здесь, правка его не принимает. */
export type SurveyCreateRequestBody = SurveyRequestBody & { isDemo: boolean };
