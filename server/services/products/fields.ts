import type { ProductRow } from '#server/repositories/products';
import { InvalidProductPriceError } from '#server/services/products/errors';
import type { Product } from '#shared/types/catalog';

/**
 * Перевод между строкой базы, контрактом ручки и полями формы.
 *
 * Операцией это не является и поэтому лежит отдельным файлом: перевод нужен всем ручкам
 * товаров сразу.
 */

export const toProduct = (row: ProductRow): Product => ({
  productId: row.id,
  name: row.name,
  description: row.description,
  photoPath: row.photoPath,
  pricePoints: row.pricePoints,
  priceRetail: row.priceRetail,
  priceCost: row.priceCost,
  publishedAt: row.publishedAt?.toISOString() ?? null,
  archivedAt: row.archivedAt?.toISOString() ?? null,
  promo: row.promo,
  hiddenInCatalog: row.hiddenInCatalog,
  isDemo: row.isDemo,
  updatedAt: row.updatedAt.toISOString(),
});

/** Поля товара из формы. Пусто — `null`: у черновика обязательных нет (issue #148). */
export type ProductFields = {
  name: string | null;
  description: string | null;
  pricePoints: number | null;
  priceRetail: number | null;
  priceCost: number | null;
  promo: boolean;
  hiddenInCatalog: boolean;
};

/**
 * Число из тела запроса. Строка с числом принимается наравне с числом: поле формы отдаёт
 * строку, и требовать от разметки приведения типа значило бы делать это в четырёх местах.
 *
 * `null` — пусто или не число вовсе.
 */
const readNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
};

/** Строка поля, обрезанная по краям. Пустое и не строка — `null`: пусто пишется одним способом. */
const readText = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value.trim() : '';

  return text === '' ? null : text;
};

/**
 * Тело запроса заведения и правки товара — так, как его видит разбор: все поля `unknown`,
 * потому что приходят они от клиента.
 */
export type ProductRequestFields = {
  name?: unknown;
  description?: unknown;
  pricePoints?: unknown;
  priceRetail?: unknown;
  priceCost?: unknown;
  promo?: unknown;
  hiddenInCatalog?: unknown;
  /** Только у заведения: правка признак не трогает (issue #212). */
  isDemo?: unknown;
};

/**
 * Поля товара из тела запроса. Обязательных здесь нет: черновик заводится первым набранным
 * символом, и чего не хватает, решает публикация, а не разбор (issue #148).
 *
 * Годность самих цен здесь тоже не решается: «ноль баллов» — это разобранный запрос
 * с негодной ценой, и сказать о нём надо иначе, чем о пустом поле.
 */
export const readProductFields = (body: ProductRequestFields | null | undefined): ProductFields => ({
  name: readText(body?.name),
  description: readText(body?.description),
  pricePoints: readNumber(body?.pricePoints),
  priceRetail: readNumber(body?.priceRetail),
  priceCost: readNumber(body?.priceCost),
  // Признаки: всё, кроме явного `true`, — «нет». Испорченный запрос не должен ни снять
  // требование цены, ни спрятать товар с витрины.
  promo: body?.promo === true,
  hiddenInCatalog: body?.hiddenInCatalog === true,
});

/**
 * Проверка заполненных цен. Стоит в сервисе, а не в разборе запроса: это правило каталога —
 * баллы строго положительны, сумы неотрицательны, — и то же правило стоит проверками
 * в миграции. Пустая цена здесь не отказ: у черновика её может не быть.
 */
export const assertPrices = (fields: ProductFields): void => {
  if (
    fields.pricePoints !== null &&
    (!Number.isInteger(fields.pricePoints) || fields.pricePoints <= 0)
  ) {
    throw new InvalidProductPriceError('pricePoints');
  }

  if (
    fields.priceRetail !== null &&
    (!Number.isInteger(fields.priceRetail) || fields.priceRetail < 0)
  ) {
    throw new InvalidProductPriceError('priceRetail');
  }

  if (fields.priceCost !== null && (!Number.isInteger(fields.priceCost) || fields.priceCost < 0)) {
    throw new InvalidProductPriceError('priceCost');
  }
};
