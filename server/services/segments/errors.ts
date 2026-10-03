/**
 * Доменные ошибки сегментов.
 *
 * Отказы двери — «не вошёл», «роль не та» — сюда не относятся: они живут в словаре
 * (`shared/denials.ts`). Здесь то, что про предмет разговора: такого сегмента нет, условий
 * нет, границы перевёрнуты.
 */
export abstract class SegmentError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnknownSegmentError extends SegmentError {
  constructor(public readonly segmentId: string) {
    super(`сегмента ${segmentId} нет`);
  }
}

/**
 * Ни одного условия. Такой сегмент — весь реестр парка под видом среза: не сохраняется
 * и состава не отдаёт.
 */
export class EmptySegmentConditionsError extends SegmentError {
  constructor() {
    super('у сегмента нет ни одного условия');
  }
}

/** Что именно не так с полями сегмента. Текст к каждой причине — у ручки. */
export type SegmentFieldProblem =
  /** Имени нет или оно из одних пробелов. */
  | 'name_missing'
  /** Граница — не целое число. */
  | 'bound_not_integer'
  /** Граница давности меньше нуля. */
  | 'days_negative'
  /** Давность «от» больше, чем «до». */
  | 'days_reversed'
  /** Баланс «от» больше, чем «до». */
  | 'balance_reversed'
  /** Признак участия или привязки — не «да», не «нет» и не «не важно». */
  | 'flag_invalid'
  /** Опрос условия — не uuid. */
  | 'survey_invalid'
  /** Состояние по опросу — не «получил, но не прошёл» и не «отказался». */
  | 'survey_state_invalid'
  /** Задан опрос без состояния или состояние без опроса. */
  | 'survey_incomplete';

export class InvalidSegmentFieldsError extends SegmentError {
  constructor(public readonly problem: SegmentFieldProblem) {
    super(`поля сегмента не годятся: ${problem}`);
  }
}

/** Опроса условия нет (issue #324). */
export class SegmentSurveyUnknownError extends SegmentError {
  constructor(public readonly surveyId: string) {
    super(`опроса ${surveyId} нет`);
  }
}

/**
 * Опрос условия не того мира (issue #324): демо-сегмент — только с демо-опросом, живой —
 * только с живым, как у рассылки и акции.
 */
export class SegmentSurveyDemoMismatchError extends SegmentError {
  constructor(
    public readonly surveyId: string,
    public readonly segmentIsDemo: boolean,
  ) {
    super(
      `опрос ${surveyId} ${segmentIsDemo ? 'живой, а сегмент демо' : 'демо, а сегмент живой'}`,
    );
  }
}

/**
 * Опрос условия не заморожен (issue #324): незамороженный ни разу не уходил рассылкой,
 * и состав по нему был бы пуст по построению.
 */
export class SegmentSurveyNotFrozenError extends SegmentError {
  constructor(public readonly surveyId: string) {
    super(`опрос ${surveyId} не заморожен`);
  }
}
