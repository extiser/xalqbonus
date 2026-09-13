import { db } from '#server/db';
import type { Prisma } from '#server/generated/prisma/client';

/**
 * Чтение каталога: офисы и товары.
 *
 * Записи здесь нет намеренно. Наполнение каталога — задача веба, и идёт она своим issue;
 * ядру заказа нужно ровно одно — узнать, можно ли заказать этот товар в этом офисе
 * и по какой цене.
 *
 * Схема в сыром SQL указывается явно — `xb.offices`, а не `offices`: `?schema=xb`
 * в строке подключения понимает Prisma, а не `pg`, и запрос без префикса молча ушёл бы
 * в `public` (docs/decisions.md → «В сыром SQL схема указывается явно»).
 */

export type OfficeRow = {
  id: string;
  name: string;
  address: string;
  /** Заполнено — офис закрыт: водителю не показывается и заказов не принимает. */
  archivedAt: Date | null;
};

export const findOffice = async (
  officeId: string,
  client: Prisma.TransactionClient = db,
): Promise<OfficeRow | null> => {
  const rows = await client.$queryRaw<OfficeRow[]>`
    SELECT "id", "name", "address", "archived_at" AS "archivedAt"
      FROM xb.offices
     WHERE "id" = ${officeId}::uuid
  `;

  return rows[0] ?? null;
};

export type ProductRow = {
  id: string;
  name: string;
  /** Цена в баллах на сейчас. Позиция заказа запоминает её своей копией. */
  pricePoints: number;
  /** Заполнено — товар архивный: заказать нельзя, а прошлые заказы его помнят. */
  archivedAt: Date | null;
};

/**
 * Товары по списку идентификаторов, одним запросом.
 *
 * Порядок строк не обещан: вызывающий сопоставляет их по `id`. Ненайденные товары
 * просто отсутствуют в ответе — их опознаёт тот, кто спрашивал.
 */
export const findProductsByIds = async (
  productIds: string[],
  client: Prisma.TransactionClient = db,
): Promise<ProductRow[]> =>
  client.$queryRaw<ProductRow[]>`
    SELECT "id", "name", "price_points" AS "pricePoints", "archived_at" AS "archivedAt"
      FROM xb.products
     WHERE "id" = ANY(${productIds}::uuid[])
  `;
