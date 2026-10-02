import type { SurveyQuestionType, SurveyTextField } from '#shared/types/survey';

/**
 * Опрос так, как он набран на экране (issue #320). Пустое поле — пустая строка, баллы —
 * строкой числового поля.
 *
 * `key` у вопроса и варианта — только для экрана: строки переставляются и удаляются,
 * и Vue должен узнавать их не по месту. Серверу ключ не уходит — у черновика вопросы
 * пишутся заново на каждом сохранении.
 */
export type SurveyFormOption = {
  key: string;
  textRu: string;
  textUz: string;
  /** У вопроса не `multiple` хранится, но уходит `false`: смена типа галочку не теряет. */
  exclusive: boolean;
};

export type SurveyFormQuestion = {
  key: string;
  type: SurveyQuestionType;
  textRu: string;
  textUz: string;
  required: boolean;
  /** У шкалы и текста хранится, но уходит `false` — как варианты. */
  allowOwnAnswer: boolean;
  /** У шкалы и текста хранятся, но не уходят: смена типа туда и обратно варианты не теряет. */
  options: SurveyFormOption[];
};

export type SurveyFormFields = Record<SurveyTextField, string> & {
  title: string;
  /** `YYYY-MM-DD` поля даты или пустая строка. */
  endsOn: string;
  points: string;
  questions: SurveyFormQuestion[];
};
