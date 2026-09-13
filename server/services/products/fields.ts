import type { ProductRow } from '#server/repositories/products';
import { InvalidProductPriceError } from '#server/services/products/errors';
import type { Product } from '#shared/types/catalog';

/**
 * Перевод между строкой базы, контрактом ручки и полями формы.
 *
 * Операцией это не является и поэтому лежит отдельным файлом: перевод нужен шести ручкам
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
  archivedAt: row.archivedAt?.toISOString() ?? null,
  updatedAt: row.updatedAt.toISOString(),
});

export type ProductFields = {
  name: string;
  description: string | null;
  pricePoints: number;
  priceRetail: number;
  priceCost: number;
};

/**
 * Число из тела запроса. Строка с числом принимается наравне с числом: поле формы отдаёт
 * строку, и требовать от разметки приведения типа значило бы делать это в четырёх местах.
 *
 * `null` — не число вовсе.
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
};

/**
 * Поля товара из тела запроса. `null` — обязательного не хватает или оно не число:
 * это разбор запроса, а не отказ человеку (`docs/frontend.md` → «Обязательное поле —
 * свойство поля»).
 *
 * Годность самих цен здесь не решается: «ноль баллов» — это разобранный запрос
 * с негодной ценой, и сказать о нём надо иначе, чем о запросе без поля вовсе.
 */
export const readProductFields = (
  body: ProductRequestFields | null | undefined,
): ProductFields | null => {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const description = typeof body?.description === 'string' ? body.description.trim() : '';

  const pricePoints = readNumber(body?.pricePoints);
  const priceRetail = readNumber(body?.priceRetail);
  const priceCost = readNumber(body?.priceCost);

  if (name === '' || pricePoints === null || priceRetail === null || priceCost === null) {
    return null;
  }

  return {
    name,
    description: description === '' ? null : description,
    pricePoints,
    priceRetail,
    priceCost,
  };
};

/**
 * Проверка цен. Стоит в сервисе, а не в разборе запроса: это правило каталога — баллы
 * строго положительны, сумы неотрицательны, — и то же правило стоит проверками в миграции.
 */
export const assertPrices = (fields: ProductFields): void => {
  if (!Number.isInteger(fields.pricePoints) || fields.pricePoints <= 0) {
    throw new InvalidProductPriceError('pricePoints');
  }

  if (!Number.isInteger(fields.priceRetail) || fields.priceRetail < 0) {
    throw new InvalidProductPriceError('priceRetail');
  }

  if (!Number.isInteger(fields.priceCost) || fields.priceCost < 0) {
    throw new InvalidProductPriceError('priceCost');
  }
};
