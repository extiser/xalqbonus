/**
 * Доменные ошибки товаров.
 *
 * Отказы двери — «не вошёл», «роль не та» — сюда не относятся: они живут в словаре
 * (`shared/denials.ts`). Здесь то, что про предмет разговора: такого товара нет, цена
 * не годится, фото не то.
 */
export abstract class ProductError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Товара с таким идентификатором нет. */
export class UnknownProductError extends ProductError {
  constructor(public readonly productId: string) {
    super(`товара ${productId} нет`);
  }
}

/**
 * Цена не годится: баллы строго положительны, сумы неотрицательны.
 *
 * Те же правила стоят проверками в миграции. Здесь они повторены не ради базы, а ради
 * ответа: отказ ограничения базы доезжает до человека пятисоткой, а не словами.
 */
export class InvalidProductPriceError extends ProductError {
  constructor(public readonly field: 'pricePoints' | 'priceRetail' | 'priceCost') {
    super(
      field === 'pricePoints'
        ? 'цена в баллах должна быть целым положительным числом'
        : 'цена в сумах должна быть целым неотрицательным числом',
    );
  }
}

/** Присланный тип содержимого не входит в список принимаемых. */
export class PhotoTypeNotAllowedError extends ProductError {
  constructor(public readonly contentType: string) {
    super(`тип ${contentType} не принимается: нужен JPEG, PNG или WebP`);
  }
}

/** Фото больше потолка. */
export class PhotoTooLargeError extends ProductError {
  constructor(
    public readonly bytes: number,
    public readonly limitBytes: number,
  ) {
    super(`фото ${bytes} б больше потолка ${limitBytes} б`);
  }
}
