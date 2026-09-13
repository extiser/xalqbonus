import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';

/**
 * Товары каталога.
 *
 * Товар не удаляется, а архивируется: на него ссылаются позиции заказов, и позиция обязана
 * помнить, что именно было заказано (docs/decisions.md → «Каталог: заказ — это касса,
 * остаток живёт по офисам»). `DELETE` в этом файле не появляется ни для чего.
 *
 * Схема в сыром SQL указывается явно — `xb.products`, а не `products`: `?schema=xb` в строке
 * подключения понимает Prisma, а не `pg`, и запрос без префикса молча ушёл бы в `public`
 * (docs/decisions.md → «В сыром SQL схема указывается явно»).
 */

type Executor = Prisma.TransactionClient;

export type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  /** Относительный путь на томе приложения. Файл кладёт сервис фото, здесь только колонка. */
  photoPath: string | null;
  /** Цена в баллах на сейчас. Позиция заказа запоминает её своей копией. */
  pricePoints: number;
  priceRetail: number;
  priceCost: number;
  /** Заполнено — товар архивный: заказать нельзя, а прошлые заказы его помнят. */
  archivedAt: Date | null;
  updatedAt: Date;
};

const PRODUCT_COLUMNS = Prisma.sql`
  "id",
  "name",
  "description",
  "photo_path"   AS "photoPath",
  "price_points" AS "pricePoints",
  "price_retail" AS "priceRetail",
  "price_cost"   AS "priceCost",
  "archived_at"  AS "archivedAt",
  "updated_at"   AS "updatedAt"
`;

/**
 * Весь каталог — и работающие товары, и архивные, архивные последними.
 *
 * Отбора по архивности нет намеренно: экран показывает архив признаком, а не прячет его.
 * Витрина водителя архивные товары не показывает, но это её отбор, а не этого запроса.
 */
export const listProducts = async (client: Executor = db): Promise<ProductRow[]> =>
  client.$queryRaw<ProductRow[]>`
    SELECT ${PRODUCT_COLUMNS}
      FROM xb.products
     ORDER BY ("archived_at" IS NOT NULL), "name"
  `;

export const findProduct = async (
  productId: string,
  client: Executor = db,
): Promise<ProductRow | null> => {
  const rows = await client.$queryRaw<ProductRow[]>`
    SELECT ${PRODUCT_COLUMNS}
      FROM xb.products
     WHERE "id" = ${productId}::uuid
  `;

  return rows[0] ?? null;
};

/**
 * Товары по списку идентификаторов, одним запросом. Нужен ядру заказа.
 *
 * Порядок строк не обещан: вызывающий сопоставляет их по `id`. Ненайденные товары
 * просто отсутствуют в ответе — их опознаёт тот, кто спрашивал.
 */
export const findProductsByIds = async (
  productIds: string[],
  client: Executor = db,
): Promise<ProductRow[]> =>
  client.$queryRaw<ProductRow[]>`
    SELECT ${PRODUCT_COLUMNS}
      FROM xb.products
     WHERE "id" = ANY(${productIds}::uuid[])
  `;

export type ProductInput = {
  name: string;
  description: string | null;
  pricePoints: number;
  priceRetail: number;
  priceCost: number;
};

export const insertProduct = async (
  input: ProductInput,
  client: Executor = db,
): Promise<ProductRow> => {
  const rows = await client.$queryRaw<ProductRow[]>`
    INSERT INTO xb.products ("name", "description", "price_points", "price_retail", "price_cost")
    VALUES (
      ${input.name},
      ${input.description},
      ${input.pricePoints},
      ${input.priceRetail},
      ${input.priceCost}
    )
    RETURNING ${PRODUCT_COLUMNS}
  `;

  const product = rows[0];

  if (!product) {
    throw new Error('вставка товара не вернула строку');
  }

  return product;
};

/**
 * Правка товара целиком. Фото сюда не входит: оно приезжает своим запросом,
 * потому что это файл, а не поле формы.
 *
 * Пустой ответ — товара с таким идентификатором нет.
 */
export const updateProductFields = async (
  productId: string,
  input: ProductInput,
  client: Executor = db,
): Promise<ProductRow | null> => {
  const rows = await client.$queryRaw<ProductRow[]>`
    UPDATE xb.products
       SET "name"         = ${input.name},
           "description"  = ${input.description},
           "price_points" = ${input.pricePoints},
           "price_retail" = ${input.priceRetail},
           "price_cost"   = ${input.priceCost},
           "updated_at"   = now()
     WHERE "id" = ${productId}::uuid
    RETURNING ${PRODUCT_COLUMNS}
  `;

  return rows[0] ?? null;
};

/**
 * Записывает путь фото.
 *
 * Двигает и `updated_at`: адрес картинки меняется вместе с расширением, а не с содержимым,
 * и разметка приписывает к нему `?v=<updatedAt>` — без сдвига отметки перезалитая картинка
 * осталась бы в кэше браузера навсегда (issue #120).
 */
export const updateProductPhotoPath = async (
  productId: string,
  photoPath: string,
  client: Executor = db,
): Promise<ProductRow | null> => {
  const rows = await client.$queryRaw<ProductRow[]>`
    UPDATE xb.products
       SET "photo_path" = ${photoPath},
           "updated_at" = now()
     WHERE "id" = ${productId}::uuid
    RETURNING ${PRODUCT_COLUMNS}
  `;

  return rows[0] ?? null;
};

/** Ставит или снимает отметку архива. Устроена как у офиса — см. `repositories/offices.ts`. */
export const updateProductArchived = async (
  productId: string,
  archived: boolean,
  client: Executor = db,
): Promise<ProductRow | null> => {
  const rows = await client.$queryRaw<ProductRow[]>`
    UPDATE xb.products
       SET "archived_at" = CASE
             WHEN ${archived} THEN COALESCE("archived_at", now())
             ELSE NULL
           END,
           "updated_at"  = now()
     WHERE "id" = ${productId}::uuid
    RETURNING ${PRODUCT_COLUMNS}
  `;

  return rows[0] ?? null;
};
