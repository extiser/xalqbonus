/**
 * Контракт страницы опроса в Mini App (issue #323): ручки `server/api/miniapp/surveys/` и плашка
 * опроса на главной.
 *
 * Тексты приезжают готовыми строками на обоих языках сразу: переключатель UZ / RU действует
 * только внутри опроса и работает без запроса к серверу, а язык профиля не меняет.
 */

import type { Language, SurveyQuestionType } from '../../server/generated/prisma/enums';

/**
 * Кусок строки: обычный или выделенный жирным — «**+50 баллов** на баланс сразу после ответов».
 * Порядок кусков задаёт язык: в узбекской строке баллы стоят в конце.
 */
export type MemberSurveyTextPart = {
  text: string;
  strong: boolean;
};

/**
 * Что показать открывшему опрос:
 *
 * - `intro` — экран открытия: ни одного ответа ещё нет, отказ его не меняет;
 * - `questions` — опрос начат: открывается на первом вопросе без ответа;
 * - `finish` — опрос пройден, и после срока тоже;
 * - `closed` — срок прошёл, а опрос не пройден.
 */
export type MemberSurveyStage = 'intro' | 'questions' | 'finish' | 'closed';

export type MemberSurveyOption = {
  optionId: string;
  text: string;
  /** Исключающий — отметка снимает остальные отметки и свой ответ. Только у `multiple`. */
  exclusive: boolean;
};

export type MemberSurveyQuestion = {
  questionId: string;
  type: SurveyQuestionType;
  required: boolean;
  /** «Свой вариант» последней строкой. Только у `single` и `multiple`. */
  allowOwnAnswer: boolean;
  /** «Вопрос 2 из 5». */
  number: string;
  text: string;
  /** Подсказка под вопросом — по типу: «Выберите один ответ». */
  hint: string;
  /** По порядку. У `text` и `scale` пусто. */
  options: MemberSurveyOption[];
};

/** Экран опроса на одном языке. */
export type MemberSurveyView = {
  intro: {
    title: string;
    lead: string;
    /** Строки условий с иконками по порядку: вопросы, баллы (при нуле строки нет), срок, сохранение. */
    terms: { kind: 'questions' | 'points' | 'until' | 'saved'; parts: MemberSurveyTextPart[] }[];
    start: string;
    decline: string;
  };
  questions: MemberSurveyQuestion[];
  /** Общее для экранов вопроса. */
  controls: {
    next: string;
    skip: string;
    /** Подпись «Назад» для экранного чтеца: на кнопке только стрелка. */
    back: string;
    ownAnswer: string;
    placeholder: string;
    scaleLow: string;
    scaleHigh: string;
    /** Ответ не сохранился — строка над кнопками. */
    saveFailed: string;
  };
  finish: {
    title: string;
    lead: string;
    /** Карточка «+50 — баллов уже на балансе». Нет — опрос без награды. */
    gain: { amount: string; caption: string } | null;
    app: string;
  };
  closed: {
    title: string;
    lead: string;
    button: string;
  };
};

/** Сохранённый ответ на вопрос. Без значения — пропущенный необязательный вопрос. */
export type MemberSurveyAnswer = {
  questionId: string;
  /** Выбранные варианты `single` и `multiple`. */
  optionIds: string[];
  /** «Свой вариант». */
  ownText: string | null;
  /** Свободный ответ `text`. */
  textValue: string | null;
  /** Оценка `scale`, 1–5. */
  scaleValue: number | null;
};

export type MemberSurvey = {
  surveyId: string;
  stage: MemberSurveyStage;
  /** Язык профиля — с него опрос открывается. */
  language: Language;
  answers: MemberSurveyAnswer[];
  views: Record<Language, MemberSurveyView>;
};

/** Ответ чтения, сохранения ответа. `null` — опроса нет или он человеку недоступен: главная. */
export type MiniAppSurveyResponse = {
  survey: MemberSurvey | null;
};

/** Тело сохранения ответа — тот же вид, что сохранённый ответ. */
export type MiniAppSurveyAnswerRequestBody = MemberSurveyAnswer;

/**
 * Плашка опроса на главной под баллами: «Опрос не закончен» или «Пройдите опрос». Нажимается
 * целиком и открывает опрос — экран выберет `stage`.
 */
export type MemberSurveyBanner = {
  surveyId: string;
  kicker: string;
  title: string;
  when: MemberSurveyTextPart[];
};
