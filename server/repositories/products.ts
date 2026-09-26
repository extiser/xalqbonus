import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';

/**
 * Товары каталога.
 *
 * Опубликованный товар не удаляется, а архивируется: на него ссылаются позиции заказов,
 * и позиция обязана помнить, что именно было заказано (docs/decisions.md → «Каталог: заказ —
 * это касса, остаток живёт по офисам»). `DELETE` в этом файле ровно один — у черновика,
 * на который не ссылается никто (issue #148).
 *
 * Схема в сыром SQL указывается явно — `xb.products`, а не `products`: `?schema=xb` в строке
 * подключения понимает Prisma, а не `pg`, и запрос без префикса молча ушёл бы в `public`
 * (docs/decisions.md → «В сыром SQL схема указывается явно»).
 */

type Executor = Prisma.TransactionClient;

export type ProductRow = {
  id: string;
  /** Пусто только у черновика — проверкой `products_published_complete_check`. */
  name: string | null;
  description: string | null;
  /** Относительный путь на томе приложения. Файл кладёт сервис фото, здесь только колонка. */
  photoPath: string | null;
  /** Цена в баллах на сейчас. Позиция заказа запоминает её своей копией. Пусто у черновика. */
  pricePoints: number | null;
  priceRetail: number | null;
  priceCost: number | null;
  /** Пусто — черновик: водителю не виден, заказать и принять в офис нельзя. */
  publishedAt: Date | null;
  /** Заполнено — товар архивный: заказать нельзя, а прошлые заказы его помнят. */
  archivedAt: Date | null;
  /** Приз для акции: публикуется без цены в баллах. */
  promo: boolean;
  /** Не показывать на витрине водителя. Остатки и приход видят его всегда. */
  hiddenInCatalog: boolean;
  /** Демо-товар (issue #212): его видит и заказывает только демо-водитель. */
  isDemo: boolean;
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
  "published_at" AS "publishedAt",
  "archived_at"  AS "archivedAt",
  "promo",
  "hidden_in_catalog" AS "hiddenInCatalog",
  "is_demo"      AS "isDemo",
  "updated_at"   AS "updatedAt"
`;

/**
 * Весь каталог — черновики, работающие товары и архивные: черновики первыми, архивные
 * последними.
 *
 * Отбора нет намеренно: экран показывает черновик и архив признаком, а не прячет их.
 * Черновик сотруднику обязан быть виден — иначе его не дописать. Витрина водителя
 * не показывает ни того, ни другого, но это её отбор, а не этого запроса.
 */
export const listProducts = async (client: Executor = db): Promise<ProductRow[]> =>
  client.$queryRaw<ProductRow[]>`
    SELECT ${PRODUCT_COLUMNS}
      FROM xb.products
     ORDER BY ("published_at" IS NOT NULL), ("archived_at" IS NOT NULL), "name"
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

/** Поля товара, которые правит форма. Пусто — `null`: у черновика обязательных нет. */
export type ProductInput = {
  name: string | null;
  description: string | null;
  pricePoints: number | null;
  priceRetail: number | null;
  priceCost: number | null;
  promo: boolean;
  hiddenInCatalog: boolean;
};

/**
 * Заводит черновик: `published_at` пуст, публикация — отдельное действие.
 *
 * Признак демо — только здесь (issue #212): правка его не трогает, живое в демо
 * не превращается и обратно.
 */
export const insertProductDraft = async (
  input: ProductInput & { isDemo: boolean },
  client: Executor = db,
): Promise<ProductRow> => {
  const rows = await client.$queryRaw<ProductRow[]>`
    INSERT INTO xb.products (
      "name", "description", "price_points", "price_retail", "price_cost",
      "promo", "hidden_in_catalog", "is_demo"
    )
    VALUES (
      ${input.name},
      ${input.description},
      ${input.pricePoints}::int,
      ${input.priceRetail}::int,
      ${input.priceCost}::int,
      ${input.promo},
      ${input.hiddenInCatalog},
      ${input.isDemo}
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
 * Полноту опубликованного товара держит `products_published_complete_check`: правка,
 * стирающая у него цену, отбивается базой, даже если проверку в сервисе обошли.
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
           "price_points" = ${input.pricePoints}::int,
           "price_retail" = ${input.priceRetail}::int,
           "price_cost"   = ${input.priceCost}::int,
           "promo"        = ${input.promo},
           "hidden_in_catalog" = ${input.hiddenInCatalog},
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

/**
 * Черновик → опубликован. Повтор у опубликованного отметку не двигает: время публикации —
 * первое, а не последнее нажатие.
 *
 * Полноту здесь проверяет база (`products_published_complete_check`): сервис смотрит поля
 * до записи ради ответа человеку, а правка, пришедшая между его чтением и этой записью,
 * отбивается ограничением. Пустой ответ — товара нет.
 */
export const markProductPublished = async (
  productId: string,
  client: Executor = db,
): Promise<ProductRow | null> => {
  const rows = await client.$queryRaw<ProductRow[]>`
    UPDATE xb.products
       SET "published_at" = COALESCE("published_at", now()),
           "updated_at"   = now()
     WHERE "id" = ${productId}::uuid
    RETURNING ${PRODUCT_COLUMNS}
  `;

  return rows[0] ?? null;
};

/**
 * Удаляет черновик физически и возвращает путь его фото, чтобы сервис снял файл с тома.
 * `null` — строки нет или товар опубликован: опубликованный архивируется, а не удаляется.
 *
 * Условие «ещё черновик» стоит в самом `DELETE`, а не проверкой перед ним: между нажатием
 * «Удалить» и записью товар мог опубликовать второй сотрудник.
 */
export const deleteProductDraft = async (
  productId: string,
  client: Executor = db,
): Promise<{ photoPath: string | null } | null> => {
  const rows = await client.$queryRaw<{ photoPath: string | null }[]>`
    DELETE FROM xb.products
     WHERE "id" = ${productId}::uuid
       AND "published_at" IS NULL
    RETURNING "photo_path" AS "photoPath"
  `;

  return rows[0] ?? null;
};

/**
 * Ставит или снимает отметку архива. Устроена как у офиса — см. `repositories/offices.ts`.
 *
 * Только у опубликованного: черновик живым не был, и архивировать его нечего — он удаляется
 * (`products_archived_published_check`). Пустой ответ — товара нет или это черновик.
 */
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
       AND "published_at" IS NOT NULL
    RETURNING ${PRODUCT_COLUMNS}
  `;

  return rows[0] ?? null;
};
