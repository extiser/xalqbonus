import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';
import type { OrderPayment } from '#server/generated/prisma/enums';
import { parkDaySql, parkDayStartSql } from '#server/utils/parkDaySql';

/**
 * Сырые выборки раздела «Отчёты» (issue #308). Только чтение: отчёты ничего не пишут
 * и схему не трогают.
 *
 * Демо не входит ни в одну цифру (docs/decisions.md → «Демо не входит ни в одну общую
 * цифру»): каждая выборка отсекает демо-офис и демо-товар, продажи — ещё и заказ демо-водителя.
 *
 * Сутки режутся одним выражением на проект — `parkDaySql` и `parkDayStartSql`, — своей формулы
 * здесь нет. Схема в сыром SQL указывается явно (docs/decisions.md → «В сыром SQL схема
 * указывается явно»).
 *
 * Суммы приходят `bigint`: розница парка за год в сумах выходит за `int`.
 */

type Executor = Prisma.TransactionClient;

/** Живые офисы для выбора в фильтре — архивные тоже, последними. */
export type ReportOfficeRow = {
  id: string;
  name: string;
  archived: boolean;
};

export const listReportOffices = async (client: Executor = db): Promise<ReportOfficeRow[]> =>
  client.$queryRaw<ReportOfficeRow[]>`
    SELECT "id",
           "name",
           "archived_at" IS NOT NULL AS "archived"
      FROM xb.offices
     WHERE NOT "is_demo"
     ORDER BY ("archived_at" IS NOT NULL), "name", "id"
  `;

/**
 * Строка продаж — офис × товар × способ оплаты за период.
 *
 * Себестоимость приезжает ценой из каталога, а не суммой: в `order_items` её снимка нет,
 * и умножает её сервис, который же решает, что делать с её отсутствием.
 */
export type SalesLineRow = {
  officeId: string;
  officeName: string;
  officeArchived: boolean;
  productId: string;
  productName: string | null;
  payment: OrderPayment;
  quantity: bigint;
  /** Сумма `quantity × unit_points`. Пусто у розницы. */
  points: bigint | null;
  /** Сумма `quantity × unit_retail`. Пусто у заказов за баллы. */
  retail: bigint | null;
  /**
   * Заказы, в которые вошёл товар. Списком, а не числом: заказ с двумя товарами стоит в двух
   * строках, и итог по офису считает различные заказы, а не складывает строки.
   */
  orderIds: string[];
  priceCost: number | null;
};

/**
 * Продажи за сутки парка `from`–`to` включительно.
 *
 * Продажа — по выдаче: только `issued`, день — по `issued_at`. Созданный и не выданный заказ —
 * резерв, а не продажа. Порядок — по имени офиса, затем товара; идентификатор в ключе
 * сортировки держит порядок одноимённых строк от запроса к запросу.
 */
export const listSalesLines = async (
  input: { from: string; to: string; officeId: string | null },
  client: Executor = db,
): Promise<SalesLineRow[]> =>
  client.$queryRaw<SalesLineRow[]>`
    SELECT office."id"                            AS "officeId",
           office."name"                          AS "officeName",
           office."archived_at" IS NOT NULL       AS "officeArchived",
           product."id"                           AS "productId",
           product."name"                         AS "productName",
           "order"."payment",
           SUM(item."quantity")::bigint                     AS "quantity",
           SUM(item."quantity" * item."unit_points")::bigint AS "points",
           SUM(item."quantity" * item."unit_retail")::bigint AS "retail",
           array_agg(DISTINCT "order"."id")                 AS "orderIds",
           product."price_cost"                   AS "priceCost"
      FROM xb.orders AS "order"
      JOIN xb.order_items AS item    ON item."order_id" = "order"."id"
      JOIN xb.offices     AS office  ON office."id" = "order"."office_id"
      JOIN xb.persons     AS person  ON person."id" = "order"."person_id"
      JOIN xb.products    AS product ON product."id" = item."product_id"
     WHERE "order"."status" = 'issued'
       AND ${parkDaySql(Prisma.sql`"order"."issued_at"`)} BETWEEN ${input.from}::date AND ${input.to}::date
       AND NOT office."is_demo"
       AND NOT person."is_demo"
       AND NOT product."is_demo"
       AND (${input.officeId}::uuid IS NULL OR "order"."office_id" = ${input.officeId}::uuid)
     GROUP BY office."id", product."id", "order"."payment"
     ORDER BY office."name", office."id", product."name", product."id"
  `;

/**
 * Момент, на который считается остаток за сутки `day`: конец этих суток — 05:00 следующего
 * дня по Ташкенту, — но не позже текущего. `dayEnd` отдаётся рядом, чтобы подпись отчёта
 * сказала, обрезан ли момент текущим.
 */
export const readStockMoment = async (
  day: string,
  client: Executor = db,
): Promise<{ moment: Date; dayEnd: Date }> => {
  const rows = await client.$queryRaw<{ moment: Date; dayEnd: Date }[]>`
    SELECT LEAST(${parkDayStartSql(Prisma.sql`${day}::date + 1`)}, now()) AS "moment",
           ${parkDayStartSql(Prisma.sql`${day}::date + 1`)}              AS "dayEnd"
  `;
  const row = rows[0];

  if (!row) {
    throw new Error('момент остатка не вычислился');
  }

  return row;
};

/**
 * Остаток офис × товар на момент — суммой движений до него.
 *
 * `office_stock` — кэш `stock_movements` (`scripts/invariants.sql`, запросы `stock`), поэтому
 * на прошлую дату остаток — это сумма журнала, а не кэш. `delta_on_hand` — свободный остаток,
 * `delta_reserved` — отложенное под заказы и награды: одно движение меняет оба.
 */
export type StockLineRow = {
  officeId: string;
  officeName: string;
  officeArchived: boolean;
  productId: string;
  productName: string | null;
  productArchived: boolean;
  free: bigint;
  reserved: bigint;
  priceCost: number | null;
  priceRetail: number | null;
};

export const listStockLines = async (
  input: { moment: Date; officeId: string | null },
  client: Executor = db,
): Promise<StockLineRow[]> =>
  client.$queryRaw<StockLineRow[]>`
    SELECT office."id"                       AS "officeId",
           office."name"                     AS "officeName",
           office."archived_at" IS NOT NULL  AS "officeArchived",
           product."id"                      AS "productId",
           product."name"                    AS "productName",
           product."archived_at" IS NOT NULL AS "productArchived",
           SUM(movement."delta_on_hand")::bigint  AS "free",
           SUM(movement."delta_reserved")::bigint AS "reserved",
           product."price_cost"              AS "priceCost",
           product."price_retail"            AS "priceRetail"
      FROM xb.stock_movements AS movement
      JOIN xb.offices  AS office  ON office."id" = movement."office_id"
      JOIN xb.products AS product ON product."id" = movement."product_id"
     WHERE movement."created_at" < ${input.moment}::timestamptz
       AND NOT office."is_demo"
       AND NOT product."is_demo"
       AND (${input.officeId}::uuid IS NULL OR movement."office_id" = ${input.officeId}::uuid)
     GROUP BY office."id", product."id"
    HAVING SUM(movement."delta_on_hand") <> 0 OR SUM(movement."delta_reserved") <> 0
     ORDER BY office."name", office."id", product."name", product."id"
  `;
