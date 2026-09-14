/**
 * Доменные ошибки журнала баллов.
 *
 * Ошибка поднимается исключением и обрабатывается там, где на неё можно осмысленно
 * отреагировать (docs/principles.md → «Ошибки»). Возвращать `{ code: 'error' }`, как
 * делал старый проект, здесь нельзя: такая ошибка не всплывает наверх и теряется.
 *
 * Повторный ключ идемпотентности ошибкой **не является**: перевод по уже записанному
 * ключу возвращается как есть, с `applied: false`. Ошибка возникает только если тем же
 * ключом пытаются записать другую операцию — см. `IdempotencyKeyConflictError`.
 */
export abstract class PointsError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Счёта нет: неизвестный человек, незаведённый водительский счёт, отсутствующий системный. */
export class UnknownAccountError extends PointsError {
  constructor(public readonly description: string) {
    super(`счёт не найден: ${description}`);
  }
}

/**
 * Водительский счёт ушёл бы в минус. Отбивается `accounts_driver_balance_check` в базе,
 * сюда попадает уже переведённым в доменную ошибку, а не пятисоткой.
 */
export class InsufficientPointsError extends PointsError {
  constructor(
    public readonly accountId: string,
    public readonly amount: bigint,
  ) {
    super(`на счёте ${accountId} недостаточно баллов для списания ${amount}`);
  }
}

/** Сумма перевода не целое положительное число. Направление задаётся парой счетов, а не знаком. */
export class InvalidTransferAmountError extends PointsError {
  constructor(public readonly amount: number) {
    super(`сумма перевода должна быть целым положительным числом, получено ${amount}`);
  }
}

/**
 * Сумма ручной правки не целая или ноль. Знак здесь допустим — он задаёт направление,
 * — и поэтому отказ свой, а не `InvalidTransferAmountError`: перевод знака не принимает.
 */
export class InvalidManualAmountError extends PointsError {
  constructor(public readonly amount: number) {
    super(`сумма ручной правки должна быть целым ненулевым числом, получено ${amount}`);
  }
}

/** Ручная правка без заметки: через месяц её не отличить от ошибки. */
export class MissingManualNoteError extends PointsError {
  constructor() {
    super('ручная правка баллов требует заметки');
  }
}

/**
 * У человека нет водительского счёта — в программе он не состоит. Ручная правка счёт
 * не заводит: иначе она вводила бы человека в баллы мимо регистрации.
 */
export class DriverAccountMissingError extends PointsError {
  constructor(public readonly personId: string) {
    super(`у человека ${personId} нет водительского счёта`);
  }
}

/** Перевод сам себе. Отбивается `point_transfers_accounts_differ_check`, проверяется и здесь. */
export class SameAccountTransferError extends PointsError {
  constructor(public readonly accountId: string) {
    super(`перевод внутри одного счёта ${accountId} не имеет смысла`);
  }
}

/**
 * Тем же ключом идемпотентности записывают другую операцию: другая причина, сумма
 * или пара счетов. Молча вернуть прежний перевод здесь нельзя — вызывающий получил бы
 * «успех» на операцию, которая не выполнялась.
 */
export class IdempotencyKeyConflictError extends PointsError {
  constructor(
    public readonly idempotencyKey: string,
    public readonly difference: string,
  ) {
    super(`ключ ${idempotencyKey} уже занят другой операцией: ${difference}`);
  }
}
