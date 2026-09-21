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
  | 'flag_invalid';

export class InvalidSegmentFieldsError extends SegmentError {
  constructor(public readonly problem: SegmentFieldProblem) {
    super(`поля сегмента не годятся: ${problem}`);
  }
}
