/**
 * Доменные ошибки заказа за баллы.
 *
 * Ошибка поднимается исключением и обрабатывается там, где на неё можно осмысленно
 * отреагировать (docs/principles.md → «Ошибки»). Ручек в этой задаче нет; когда они
 * появятся, отказ обязан говорить кодом, а текст к коду браться из словаря — поэтому
 * каждая ошибка здесь несёт не строку для человека, а то, чего именно не хватило.
 *
 * Повторный вызов операции ошибкой **не является** сам по себе: двойной тап — штатный
 * случай, и вызывающий решает, показывать отказ или промолчать, потому что дело уже сделано.
 * Вторая отмена видит `OrderNotPendingError`, вторая выдача — `OrderNotFoundError`: заказ
 * берётся под блокировку только висящим, а выданный уже не висит. Ни та, ни другая не делают
 * ни одной записи.
 */
export abstract class OrdersError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Офиса нет или он архивный: заказы он не принимает. */
export class OfficeUnavailableError extends OrdersError {
  constructor(public readonly officeId: string) {
    super(`офис ${officeId} не принимает заказы`);
  }
}

/** Товара нет или он архивный: прошлые заказы его помнят, новые его не берут. */
export class ProductUnavailableError extends OrdersError {
  constructor(public readonly productId: string) {
    super(`товар ${productId} нельзя заказать`);
  }
}

/**
 * В офисе не хватает свободного остатка.
 *
 * Несёт и товар, и офис, и числа: «товара нет» без них не отличить от «кто-то успел
 * забрать последний, пока водитель листал витрину», а это разные разговоры.
 */
export class InsufficientStockError extends OrdersError {
  constructor(
    public readonly officeId: string,
    public readonly productId: string,
    public readonly requested: number,
    public readonly available: number,
  ) {
    super(
      `в офисе ${officeId} товара ${productId} свободно ${available}, запрошено ${requested}`,
    );
  }
}

/** Заказ без позиций. Списывать нечего, резервировать нечего. */
export class EmptyOrderError extends OrdersError {
  constructor() {
    super('заказ без позиций');
  }
}

/** Количество в позиции — не целое положительное число. */
export class InvalidOrderQuantityError extends OrdersError {
  constructor(
    public readonly productId: string,
    public readonly quantity: number,
  ) {
    super(`количество товара ${productId} должно быть целым положительным, получено ${quantity}`);
  }
}

/**
 * Один товар пришёл в заказе двумя позициями.
 *
 * Не складывается молча: две строки с разным количеством на один товар означают, что
 * вызывающий потерял состояние корзины, и сложить их — значит заказать за человека то,
 * чего он не выбирал. Уникальность пары стоит и в базе.
 */
export class DuplicateOrderItemError extends OrdersError {
  constructor(public readonly productId: string) {
    super(`товар ${productId} пришёл в заказе дважды`);
  }
}

/**
 * Пять цифр кода не нашлись за отведённые попытки.
 *
 * Практически недостижимо: индекс частичный, и код занят только висящими заказами —
 * их на весь парк десяток. Ошибка нужна, чтобы невозможное не превратилось в вечный цикл.
 */
export class OrderCodeCollisionError extends OrdersError {
  constructor(public readonly attempts: number) {
    super(`свободный код заказа не нашёлся за ${attempts} попыток`);
  }
}

/** Заказа с таким идентификатором нет вовсе. */
export class UnknownOrderError extends OrdersError {
  constructor(public readonly orderId: string) {
    super(`заказа ${orderId} нет`);
  }
}

/**
 * Автор отмены не сходится с её причиной.
 *
 * Сотрудник обязателен у причины `employee` и запрещён у `driver` и `expired`: записать
 * автором сотрудника там, где отменял водитель или воркер, значило бы соврать в разборе
 * спора у стойки. То же правило стоит проверкой в базе.
 */
export class CancelAuthorMismatchError extends OrdersError {
  constructor(public readonly reason: string) {
    super(`причина отмены ${reason} не сходится с автором`);
  }
}

/**
 * Висящего заказа нет: по идентификатору он уже не висит (`issueOrder`). Код у стойки ищет
 * `findDeskItemByCode`, и его отказ — `DeskCodeNotFoundError`.
 */
export class OrderNotFoundError extends OrdersError {
  /** Идентификатор заказа — то, по чему искали. */
  constructor(public readonly reference: string) {
    super(`висящего заказа ${reference} нет`);
  }
}

/**
 * Заказ уже не висит: выдан или отменён.
 *
 * Это исход двойного тапа и гонки двух сотрудников у одной стойки. Вторая операция
 * не делается — первая уже сделана.
 */
export class OrderNotPendingError extends OrdersError {
  constructor(
    public readonly orderId: string,
    public readonly status: string,
  ) {
    super(`заказ ${orderId} уже не висит: ${status}`);
  }
}
