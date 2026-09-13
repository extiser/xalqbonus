/**
 * Доменные ошибки остатков.
 *
 * Остаток правят две операции для веба — приход и правка, — и обе обязаны отказывать
 * внятно: «не получилось» на складской операции означает пересчёт полки руками.
 */
export abstract class StockError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Количество прихода — не целое положительное число. */
export class InvalidReceiveQuantityError extends StockError {
  constructor(public readonly quantity: number) {
    super(`приход должен быть целым положительным числом, получено ${quantity}`);
  }
}

/**
 * Правка на ноль. Не пишется: движение, ничего не меняющее, — это запись в журнал,
 * которая ни на один вопрос не отвечает.
 */
export class EmptyAdjustmentError extends StockError {
  constructor() {
    super('правка остатка на ноль ничего не меняет');
  }
}

/** Правка без заметки. Правка без объяснения через месяц неотличима от ошибки кода. */
export class MissingAdjustmentNoteError extends StockError {
  constructor() {
    super('правка остатка требует заметки');
  }
}

/**
 * Целевое значение остатка — не целое неотрицательное число.
 *
 * Проверяется сервисом, а не ручкой: так же, как количество прихода. Сервис отвечает
 * за свой контракт сам — иначе дробное значение доехало бы до целочисленной колонки
 * и вернулось пятисоткой Postgres.
 */
export class InvalidStockTargetError extends StockError {
  constructor(public readonly target: number) {
    super(`новое значение остатка должно быть целым неотрицательным числом, получено ${target}`);
  }
}

/**
 * Результат увёл бы свободный остаток в минус.
 *
 * Отбивается `office_stock_on_hand_check` в базе и приходит сюда доменной ошибкой,
 * а не пятисоткой: минус в остатке — это ошибка кода, и база обязана её остановить.
 */
export class StockWouldGoNegativeError extends StockError {
  constructor(
    public readonly officeId: string,
    public readonly productId: string,
  ) {
    super(`правка увела бы остаток товара ${productId} в офисе ${officeId} в минус`);
  }
}

/** Офиса или товара нет: движение некуда записать. */
export class UnknownStockTargetError extends StockError {
  constructor(
    public readonly officeId: string,
    public readonly productId: string,
  ) {
    super(`офиса ${officeId} или товара ${productId} нет`);
  }
}
