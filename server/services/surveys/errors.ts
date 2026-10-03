/**
 * Доменные ошибки опросов (issue #320).
 *
 * Отказы двери — «не вошёл», «роль не та», «демо правит владелец» — сюда не относятся: они
 * живут в словаре (`shared/denials.ts`). Здесь то, что про предмет разговора.
 */
export abstract class SurveyError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnknownSurveyError extends SurveyError {
  constructor(public readonly surveyId: string) {
    super(`опроса ${surveyId} нет`);
  }
}

/**
 * Опрос заморожен, а действие трогает то, что замораживается: содержимое, или удаление.
 * У замороженного правятся только название и дата окончания; остальное — копией.
 */
export class SurveyFrozenError extends SurveyError {
  constructor(
    public readonly surveyId: string,
    public readonly action: 'update' | 'delete',
  ) {
    super(`опрос ${surveyId} заморожен, действие ${action} не допускается`);
  }
}

/**
 * Замороженному опросу стёрли название или срок. Пусто бывает только у черновика: того же
 * требует база (`surveys_frozen_complete_check`), здесь — чтобы сказать словами.
 */
export class SurveyFrozenFieldRequiredError extends SurveyError {
  constructor(
    public readonly surveyId: string,
    public readonly field: 'title' | 'endsOn',
  ) {
    super(`у замороженного опроса ${surveyId} поле ${field} обязательно`);
  }
}

/**
 * Черновик опроса прикреплён к черновику рассылки (issue #321): удалить его нельзя, пока
 * не откреплён там. Откреплять молча — менять чужой черновик.
 */
export class SurveyAttachedError extends SurveyError {
  constructor(public readonly surveyId: string) {
    super(`опрос ${surveyId} прикреплён к рассылке и не удаляется`);
  }
}

/**
 * Последний день, который ставят опросу, уже прошёл (issue #348). Закрыть опрос сейчас —
 * кнопкой «Завершить опрос», а не датой в прошлом.
 */
export class SurveyEndsOnPastError extends SurveyError {
  constructor(public readonly endsOn: string) {
    super(`последний день опроса ${endsOn} уже прошёл`);
  }
}

/**
 * Опрос уже завершён досрочно (issue #348): второе нажатие «Завершить опрос» или правка
 * последнего дня у завершённого. Отметка не снимается, а последний день у завершённого
 * ничего не решает — менять его незачем.
 */
export class SurveyFinishedError extends SurveyError {
  constructor(
    public readonly surveyId: string,
    public readonly action: 'finish' | 'ends_on',
  ) {
    super(`опрос ${surveyId} уже завершён досрочно, действие ${action} не допускается`);
  }
}

/**
 * Опрос не из тех, что завершаются досрочно (issue #348): черновик никуда не уходил,
 * а закрытый по сроку уже закрыт.
 */
export class SurveyNotFinishableError extends SurveyError {
  constructor(
    public readonly surveyId: string,
    public readonly reason: 'draft' | 'closed',
  ) {
    super(`опрос ${surveyId} не завершается досрочно: ${reason}`);
  }
}

/** Тело запроса не разобрать: не тот тип вопроса, не дата, не целое число баллов. */
export class SurveyRequestInvalidError extends SurveyError {
  constructor(public readonly reason: SurveyRequestInvalidReason) {
    super(`тело запроса опроса не разобрано: ${reason}`);
  }
}

export type SurveyRequestInvalidReason =
  | 'ends_on'
  | 'points'
  | 'content'
  | 'question_type'
  | 'question_options'
  | 'question_own_answer'
  | 'option_exclusive';

/**
 * Ответ водителя не разобран (issue #323): не тот вопрос, вариант чужого вопроса, значение
 * не того типа, «Свой вариант» без разрешения, исключающий вариант с соседями, пустой ответ
 * на обязательный вопрос. Экран такого не шлёт — это испорченный запрос, а не отказ водителю.
 */
export class SurveyAnswerInvalidError extends SurveyError {
  constructor(public readonly reason: SurveyAnswerInvalidReason) {
    super(`ответ на вопрос опроса не разобран: ${reason}`);
  }
}

export type SurveyAnswerInvalidReason =
  | 'question'
  | 'option'
  | 'value_type'
  | 'own_answer'
  | 'exclusive'
  | 'single_choice'
  | 'text_length'
  | 'scale_value'
  | 'required';
