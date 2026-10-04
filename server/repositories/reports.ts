import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';
import type {
  EmployeeRole,
  OrderPayment,
  PointReason,
  RewardSource,
} from '#server/generated/prisma/enums';
import { parkDaySql, parkDayStartSql } from '#server/utils/parkDaySql';

/**
 * Сырые выборки раздела «Отчёты» (issue #308). Только чтение: отчёты ничего не пишут
 * и схему не трогают.
 *
 * Демо не входит ни в одну цифру (docs/decisions.md → «Демо не входит ни в одну общую
 * цифру»): каждая выборка отсекает демо-офис и демо-товар, продажи — ещё и заказ демо-водителя.
 *
 * Сутки календарные, с полуночи по Ташкенту (docs/decisions.md → «Сутки — с 00:00 до 00:00
 * по Ташкенту; у акции — свои, с 05:00»), и режутся одним выражением на проект — `parkDaySql`
 * и `parkDayStartSql`, — своей формулы здесь нет. Схема в сыром SQL указывается явно (docs/decisions.md → «В сыром SQL схема
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
 * Себестоимость — по снимку в строке заказа (`order_items.unit_cost`, issue #372), а не
 * по текущему каталогу: правка цены товара прошлые продажи не переписывает.
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
  /**
   * Сумма `quantity × unit_cost`. Пусто, если снимка нет хоть у одной строки группы:
   * частичная сумма выдала бы себестоимость меньше настоящей.
   */
  cost: bigint | null;
};

/**
 * Продажи за сутки `from`–`to` включительно.
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
           CASE WHEN bool_and(item."unit_cost" IS NOT NULL)
                THEN SUM(item."quantity" * item."unit_cost")::bigint
           END                                              AS "cost"
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
 * Момент, на который считается остаток за сутки `day`: конец этих суток — 00:00 следующего
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

/**
 * Границы периода `from`–`to` включительно (issue #309): начало — 00:00 первых суток
 * по Ташкенту, конец — 00:00 суток после последних, но не позже текущего момента. `periodEnd`
 * отдаётся рядом, чтобы подпись отчёта сказала, обрезан ли конец текущим.
 */
export type ReportPeriodMoments = {
  start: Date;
  end: Date;
  periodEnd: Date;
};

export const readPeriodMoments = async (
  input: { from: string; to: string },
  client: Executor = db,
): Promise<ReportPeriodMoments> => {
  const rows = await client.$queryRaw<ReportPeriodMoments[]>`
    SELECT ${parkDayStartSql(Prisma.sql`${input.from}::date`)}                AS "start",
           LEAST(${parkDayStartSql(Prisma.sql`${input.to}::date + 1`)}, now()) AS "end",
           ${parkDayStartSql(Prisma.sql`${input.to}::date + 1`)}              AS "periodEnd"
  `;
  const row = rows[0];

  if (!row) {
    throw new Error('границы периода не вычислились');
  }

  return row;
};

/**
 * Строка оборотной ведомости — офис × товар за период (issue #309).
 *
 * «Всего в офисе» — свободный остаток плюс резерв: резерв и его снятие товар из офиса
 * не выносят, и на начало и конец они не влияют. Начало и конец считаются суммой журнала
 * сами по себе, а не из движения за период: сходимость проверяет сервис, и посчитанный
 * из движения конец сошёлся бы по построению, ничего не проверив.
 *
 * Выдачи заказов делятся по способу оплаты заказа; движение `order_issue` несёт заказ всегда
 * (`stock_movements_kind_signs_check`).
 */
export type TurnoverLineRow = {
  officeId: string;
  officeName: string;
  officeArchived: boolean;
  productId: string;
  productName: string | null;
  productArchived: boolean;
  opening: bigint;
  incoming: bigint;
  adjustmentPlus: bigint;
  adjustmentMinus: bigint;
  issuedPoints: bigint;
  issuedRetail: bigint;
  issuedRewards: bigint;
  closing: bigint;
  closingReserved: bigint;
  priceCost: number | null;
};

/**
 * Строки — пары, у которых за период было хоть одно движение или «всего в офисе» на начало
 * либо конец не ноль. Порядок — по имени офиса, затем товара, как в остатках.
 */
export const listTurnoverLines = async (
  input: { start: Date; end: Date; officeId: string | null },
  client: Executor = db,
): Promise<TurnoverLineRow[]> =>
  client.$queryRaw<TurnoverLineRow[]>`
    SELECT office."id"                       AS "officeId",
           office."name"                     AS "officeName",
           office."archived_at" IS NOT NULL  AS "officeArchived",
           product."id"                      AS "productId",
           product."name"                    AS "productName",
           product."archived_at" IS NOT NULL AS "productArchived",
           COALESCE(SUM(movement."delta_on_hand" + movement."delta_reserved")
             FILTER (WHERE movement."created_at" < ${input.start}::timestamptz), 0)::bigint AS "opening",
           COALESCE(SUM(movement."delta_on_hand")
             FILTER (WHERE movement."created_at" >= ${input.start}::timestamptz
                       AND movement."kind" = 'incoming'), 0)::bigint AS "incoming",
           COALESCE(SUM(movement."delta_on_hand")
             FILTER (WHERE movement."created_at" >= ${input.start}::timestamptz
                       AND movement."kind" = 'adjustment'
                       AND movement."delta_on_hand" > 0), 0)::bigint AS "adjustmentPlus",
           COALESCE(-SUM(movement."delta_on_hand")
             FILTER (WHERE movement."created_at" >= ${input.start}::timestamptz
                       AND movement."kind" = 'adjustment'
                       AND movement."delta_on_hand" < 0), 0)::bigint AS "adjustmentMinus",
           COALESCE(-SUM(movement."delta_reserved")
             FILTER (WHERE movement."created_at" >= ${input.start}::timestamptz
                       AND movement."kind" = 'order_issue'
                       AND "order"."payment" = 'points'), 0)::bigint AS "issuedPoints",
           COALESCE(-SUM(movement."delta_reserved")
             FILTER (WHERE movement."created_at" >= ${input.start}::timestamptz
                       AND movement."kind" = 'order_issue'
                       AND "order"."payment" = 'retail'), 0)::bigint AS "issuedRetail",
           COALESCE(-SUM(movement."delta_reserved")
             FILTER (WHERE movement."created_at" >= ${input.start}::timestamptz
                       AND movement."kind" = 'reward_issue'), 0)::bigint AS "issuedRewards",
           SUM(movement."delta_on_hand" + movement."delta_reserved")::bigint AS "closing",
           SUM(movement."delta_reserved")::bigint                            AS "closingReserved",
           product."price_cost"              AS "priceCost"
      FROM xb.stock_movements AS movement
      JOIN xb.offices  AS office  ON office."id" = movement."office_id"
      JOIN xb.products AS product ON product."id" = movement."product_id"
      LEFT JOIN xb.orders AS "order" ON "order"."id" = movement."order_id"
     WHERE movement."created_at" < ${input.end}::timestamptz
       AND NOT office."is_demo"
       AND NOT product."is_demo"
       AND (${input.officeId}::uuid IS NULL OR movement."office_id" = ${input.officeId}::uuid)
     GROUP BY office."id", product."id"
    HAVING COUNT(*) FILTER (WHERE movement."created_at" >= ${input.start}::timestamptz) > 0
        OR SUM(movement."delta_on_hand" + movement."delta_reserved")
             FILTER (WHERE movement."created_at" < ${input.start}::timestamptz) <> 0
        OR SUM(movement."delta_on_hand" + movement."delta_reserved") <> 0
     ORDER BY office."name", office."id", product."name", product."id"
  `;

/** Ручная правка остатка за период (issue #309): движение `adjustment` с автором и заметкой. */
export type AdjustmentRow = {
  createdAt: Date;
  officeId: string;
  officeName: string;
  officeArchived: boolean;
  productName: string | null;
  productArchived: boolean;
  delta: number;
  priceCost: number | null;
  /** Пусто только у правки без автора — такой база не допускает, но выборка её не теряет. */
  employeeName: string | null;
  note: string | null;
};

/** Правки за период, новые первыми; идентификатор держит порядок правок одной секунды. */
export const listAdjustments = async (
  input: { start: Date; end: Date; officeId: string | null },
  client: Executor = db,
): Promise<AdjustmentRow[]> =>
  client.$queryRaw<AdjustmentRow[]>`
    SELECT movement."created_at"             AS "createdAt",
           office."id"                       AS "officeId",
           office."name"                     AS "officeName",
           office."archived_at" IS NOT NULL  AS "officeArchived",
           product."name"                    AS "productName",
           product."archived_at" IS NOT NULL AS "productArchived",
           movement."delta_on_hand"          AS "delta",
           product."price_cost"              AS "priceCost",
           employee."full_name"              AS "employeeName",
           movement."note"
      FROM xb.stock_movements AS movement
      JOIN xb.offices  AS office  ON office."id" = movement."office_id"
      JOIN xb.products AS product ON product."id" = movement."product_id"
      LEFT JOIN xb.employees AS employee ON employee."id" = movement."employee_id"
     WHERE movement."kind" = 'adjustment'
       AND movement."created_at" >= ${input.start}::timestamptz
       AND movement."created_at" <  ${input.end}::timestamptz
       AND NOT office."is_demo"
       AND NOT product."is_demo"
       AND (${input.officeId}::uuid IS NULL OR movement."office_id" = ${input.officeId}::uuid)
     ORDER BY movement."created_at" DESC, movement."id" DESC
  `;

/**
 * Награды, занимающие товар или выдаваемые в офисе, за период (issue #310): выданные —
 * по `issued_at`, сгоревшие — по `expired_at`. Строка — статус × офис × награда × источник.
 *
 * Награда-товар называется товаром, произвольная — своим заголовком: заголовок и группирует
 * произвольные, товар — свой идентификатор. Баллы-награды сюда не входят: офиса у них нет,
 * и они — перевод, который считает «Экономика балла».
 */
export type RewardLineRow = {
  status: 'issued' | 'expired';
  officeId: string;
  officeName: string;
  officeArchived: boolean;
  kind: 'product' | 'custom';
  productName: string | null;
  productArchived: boolean;
  /** Заголовок произвольной награды. Пусто у товара. */
  customTitle: string | null;
  source: RewardSource;
  quantity: bigint;
  /**
   * Сумма снимков `rewards.cost` по группе (issue #372). Пусто у произвольной и у группы,
   * где снимка нет хоть у одной награды-товара.
   */
  cost: bigint | null;
};

export const listRewardLines = async (
  input: { from: string; to: string; officeId: string | null },
  client: Executor = db,
): Promise<RewardLineRow[]> =>
  client.$queryRaw<RewardLineRow[]>`
    SELECT reward."status",
           office."id"                       AS "officeId",
           office."name"                     AS "officeName",
           office."archived_at" IS NOT NULL  AS "officeArchived",
           reward."kind",
           product."name"                    AS "productName",
           COALESCE(product."archived_at" IS NOT NULL, false) AS "productArchived",
           CASE WHEN reward."kind" = 'custom' THEN reward."title" END AS "customTitle",
           reward."source",
           COUNT(*)::bigint                  AS "quantity",
           CASE WHEN reward."kind" = 'product' AND bool_and(reward."cost" IS NOT NULL)
                THEN SUM(reward."cost")::bigint
           END                               AS "cost"
      FROM xb.rewards AS reward
      JOIN xb.offices AS office  ON office."id" = reward."office_id"
      JOIN xb.persons AS person  ON person."id" = reward."person_id"
      LEFT JOIN xb.products AS product ON product."id" = reward."product_id"
     WHERE reward."kind" IN ('product', 'custom')
       AND (
             (reward."status" = 'issued'
              AND ${parkDaySql(Prisma.sql`reward."issued_at"`)} BETWEEN ${input.from}::date AND ${input.to}::date)
          OR (reward."status" = 'expired'
              AND ${parkDaySql(Prisma.sql`reward."expired_at"`)} BETWEEN ${input.from}::date AND ${input.to}::date)
           )
       AND NOT office."is_demo"
       AND NOT person."is_demo"
       AND NOT COALESCE(product."is_demo", false)
       AND (${input.officeId}::uuid IS NULL OR reward."office_id" = ${input.officeId}::uuid)
     GROUP BY reward."status", office."id", reward."kind", product."id",
              CASE WHEN reward."kind" = 'custom' THEN reward."title" END, reward."source"
     ORDER BY office."name", office."id",
              COALESCE(product."name", CASE WHEN reward."kind" = 'custom' THEN reward."title" END),
              product."id", reward."source"
  `;

/**
 * Судьба заказов из бота по офисам (issue #310): заказы, оформленные водителем за период
 * (`created_at`), и что с ними сейчас. Заказ у стойки выдаётся сразу — здесь его нет.
 */
export type OrderOutcomeOfficeRow = {
  officeId: string;
  officeName: string;
  officeArchived: boolean;
  created: bigint;
  issued: bigint;
  cancelledByDriver: bigint;
  cancelledByEmployee: bigint;
  expired: bigint;
  pending: bigint;
};

export const listOrderOutcomesByOffice = async (
  input: { from: string; to: string; officeId: string | null },
  client: Executor = db,
): Promise<OrderOutcomeOfficeRow[]> =>
  client.$queryRaw<OrderOutcomeOfficeRow[]>`
    SELECT office."id"                      AS "officeId",
           office."name"                    AS "officeName",
           office."archived_at" IS NOT NULL AS "officeArchived",
           COUNT(*)::bigint                                                      AS "created",
           COUNT(*) FILTER (WHERE "order"."status" = 'issued')::bigint           AS "issued",
           COUNT(*) FILTER (WHERE "order"."cancel_reason" = 'driver')::bigint    AS "cancelledByDriver",
           COUNT(*) FILTER (WHERE "order"."cancel_reason" = 'employee')::bigint  AS "cancelledByEmployee",
           COUNT(*) FILTER (WHERE "order"."cancel_reason" = 'expired')::bigint   AS "expired",
           COUNT(*) FILTER (WHERE "order"."status" = 'pending')::bigint          AS "pending"
      FROM xb.orders AS "order"
      JOIN xb.offices AS office ON office."id" = "order"."office_id"
      JOIN xb.persons AS person ON person."id" = "order"."person_id"
     WHERE "order"."channel" = 'bot'
       AND ${parkDaySql(Prisma.sql`"order"."created_at"`)} BETWEEN ${input.from}::date AND ${input.to}::date
       AND NOT office."is_demo"
       AND NOT person."is_demo"
       AND (${input.officeId}::uuid IS NULL OR "order"."office_id" = ${input.officeId}::uuid)
     GROUP BY office."id"
     ORDER BY office."name", office."id"
  `;

/**
 * Судьба заказов из бота по товарам (issue #310): штуки позиций тех же заказов. Первыми —
 * товары, которые чаще всего заказывают и не забирают.
 */
export type OrderOutcomeProductRow = {
  productName: string | null;
  productArchived: boolean;
  ordered: bigint;
  issued: bigint;
  expired: bigint;
  cancelled: bigint;
};

export const listOrderOutcomesByProduct = async (
  input: { from: string; to: string; officeId: string | null },
  client: Executor = db,
): Promise<OrderOutcomeProductRow[]> =>
  client.$queryRaw<OrderOutcomeProductRow[]>`
    SELECT product."name"                    AS "productName",
           product."archived_at" IS NOT NULL AS "productArchived",
           SUM(item."quantity")::bigint                                                   AS "ordered",
           COALESCE(SUM(item."quantity") FILTER (WHERE "order"."status" = 'issued'), 0)::bigint AS "issued",
           COALESCE(SUM(item."quantity") FILTER (WHERE "order"."cancel_reason" = 'expired'), 0)::bigint AS "expired",
           COALESCE(SUM(item."quantity")
             FILTER (WHERE "order"."cancel_reason" IN ('driver', 'employee')), 0)::bigint AS "cancelled"
      FROM xb.orders AS "order"
      JOIN xb.order_items AS item    ON item."order_id" = "order"."id"
      JOIN xb.products    AS product ON product."id" = item."product_id"
      JOIN xb.offices     AS office  ON office."id" = "order"."office_id"
      JOIN xb.persons     AS person  ON person."id" = "order"."person_id"
     WHERE "order"."channel" = 'bot'
       AND ${parkDaySql(Prisma.sql`"order"."created_at"`)} BETWEEN ${input.from}::date AND ${input.to}::date
       AND NOT office."is_demo"
       AND NOT person."is_demo"
       AND NOT product."is_demo"
       AND (${input.officeId}::uuid IS NULL OR "order"."office_id" = ${input.officeId}::uuid)
     GROUP BY product."id"
     ORDER BY "expired" DESC, product."name", product."id"
  `;

/**
 * Работа сотрудника в офисе за период (issue #310): каждое действие — событием со своим
 * моментом и офисом, строка — сотрудник × офис. Офис строки — офис заказа, награды
 * или движения, а не закрепление сотрудника: работу в чужом офисе видно там, где она была.
 */
export type StaffLineRow = {
  employeeId: string;
  employeeName: string;
  role: EmployeeRole;
  officeId: string;
  officeName: string;
  officeArchived: boolean;
  issuedByCode: bigint;
  deskPoints: bigint;
  deskRetail: bigint;
  deskRetailSum: bigint;
  rewardsIssued: bigint;
  ordersCancelled: bigint;
  adjustments: bigint;
};

export const listStaffLines = async (
  input: { from: string; to: string; officeId: string | null },
  client: Executor = db,
): Promise<StaffLineRow[]> =>
  client.$queryRaw<StaffLineRow[]>`
    WITH events AS (
      SELECT "order"."issued_by_employee_id" AS "employee_id",
             "order"."office_id",
             'issued_by_code'                AS "action",
             0                               AS "retail"
        FROM xb.orders AS "order"
        JOIN xb.persons AS person ON person."id" = "order"."person_id"
       WHERE "order"."channel" = 'bot'
         AND "order"."issued_by_employee_id" IS NOT NULL
         AND ${parkDaySql(Prisma.sql`"order"."issued_at"`)} BETWEEN ${input.from}::date AND ${input.to}::date
         AND NOT person."is_demo"
      UNION ALL
      SELECT "order"."created_by_employee_id",
             "order"."office_id",
             CASE "order"."payment" WHEN 'points' THEN 'desk_points' ELSE 'desk_retail' END,
             COALESCE("order"."total_retail", 0)
        FROM xb.orders AS "order"
        JOIN xb.persons AS person ON person."id" = "order"."person_id"
       WHERE "order"."channel" = 'desk'
         AND "order"."created_by_employee_id" IS NOT NULL
         AND ${parkDaySql(Prisma.sql`"order"."issued_at"`)} BETWEEN ${input.from}::date AND ${input.to}::date
         AND NOT person."is_demo"
      UNION ALL
      SELECT reward."issued_by_employee_id",
             reward."office_id",
             'reward_issued',
             0
        FROM xb.rewards AS reward
        JOIN xb.persons AS person ON person."id" = reward."person_id"
       WHERE reward."issued_by_employee_id" IS NOT NULL
         AND reward."office_id" IS NOT NULL
         AND ${parkDaySql(Prisma.sql`reward."issued_at"`)} BETWEEN ${input.from}::date AND ${input.to}::date
         AND NOT person."is_demo"
      UNION ALL
      SELECT "order"."cancelled_by_employee_id",
             "order"."office_id",
             'order_cancelled',
             0
        FROM xb.orders AS "order"
        JOIN xb.persons AS person ON person."id" = "order"."person_id"
       WHERE "order"."cancelled_by_employee_id" IS NOT NULL
         AND ${parkDaySql(Prisma.sql`"order"."cancelled_at"`)} BETWEEN ${input.from}::date AND ${input.to}::date
         AND NOT person."is_demo"
      UNION ALL
      SELECT movement."employee_id",
             movement."office_id",
             'adjustment',
             0
        FROM xb.stock_movements AS movement
        JOIN xb.products AS product ON product."id" = movement."product_id"
       WHERE movement."kind" = 'adjustment'
         AND movement."employee_id" IS NOT NULL
         AND ${parkDaySql(Prisma.sql`movement."created_at"`)} BETWEEN ${input.from}::date AND ${input.to}::date
         AND NOT product."is_demo"
    )
    SELECT employee."id"                     AS "employeeId",
           employee."full_name"              AS "employeeName",
           employee."role",
           office."id"                       AS "officeId",
           office."name"                     AS "officeName",
           office."archived_at" IS NOT NULL  AS "officeArchived",
           COUNT(*) FILTER (WHERE event."action" = 'issued_by_code')::bigint  AS "issuedByCode",
           COUNT(*) FILTER (WHERE event."action" = 'desk_points')::bigint     AS "deskPoints",
           COUNT(*) FILTER (WHERE event."action" = 'desk_retail')::bigint     AS "deskRetail",
           COALESCE(SUM(event."retail") FILTER (WHERE event."action" = 'desk_retail'), 0)::bigint AS "deskRetailSum",
           COUNT(*) FILTER (WHERE event."action" = 'reward_issued')::bigint   AS "rewardsIssued",
           COUNT(*) FILTER (WHERE event."action" = 'order_cancelled')::bigint AS "ordersCancelled",
           COUNT(*) FILTER (WHERE event."action" = 'adjustment')::bigint      AS "adjustments"
      FROM events AS event
      JOIN xb.employees AS employee ON employee."id" = event."employee_id"
      JOIN xb.offices   AS office   ON office."id" = event."office_id"
     WHERE NOT employee."is_demo"
       AND NOT office."is_demo"
       AND (${input.officeId}::uuid IS NULL OR event."office_id" = ${input.officeId}::uuid)
     GROUP BY employee."id", office."id"
     ORDER BY employee."full_name", employee."id", office."name", office."id"
  `;

/**
 * Баллы водителей за период по причине перевода (issue #310). Сторона водителя — счёт `driver`
 * не демо-человека: пришедшее на него и ушедшее с него считаются порознь.
 *
 * Перенос из старой базы, баллы демо-водителю и объединение двойников сюда не входят: первое —
 * не событие периода, остальные — переводы внутри водителей или к демо.
 *
 * Период — моментами начала суток, а не выражением суток над каждой строкой: переводов
 * за год — сотни тысяч, и граница по `occurred_at` берёт индекс `(reason, occurred_at)`.
 */
export type PointReasonLineRow = {
  reason: PointReason;
  received: bigint;
  spent: bigint;
};

export const listPointReasonLines = async (
  input: { from: string; to: string },
  client: Executor = db,
): Promise<PointReasonLineRow[]> =>
  client.$queryRaw<PointReasonLineRow[]>`
    SELECT transfer."reason",
           COALESCE(SUM(transfer."amount")
             FILTER (WHERE target."type" = 'driver' AND NOT target_person."is_demo"), 0)::bigint AS "received",
           COALESCE(SUM(transfer."amount")
             FILTER (WHERE source."type" = 'driver' AND NOT source_person."is_demo"), 0)::bigint AS "spent"
      FROM xb.point_transfers AS transfer
      JOIN xb.accounts AS source ON source."id" = transfer."from_account_id"
      JOIN xb.accounts AS target ON target."id" = transfer."to_account_id"
      LEFT JOIN xb.persons AS source_person ON source_person."id" = source."person_id"
      LEFT JOIN xb.persons AS target_person ON target_person."id" = target."person_id"
     WHERE transfer."reason" NOT IN ('opening', 'demo_grant', 'merge')
       AND transfer."occurred_at" >= ${parkDayStartSql(Prisma.sql`${input.from}::date`)}
       AND transfer."occurred_at" <  ${parkDayStartSql(Prisma.sql`${input.to}::date + 1`)}
     GROUP BY transfer."reason"
    HAVING COUNT(*) FILTER (WHERE (source."type" = 'driver' AND NOT source_person."is_demo")
                               OR (target."type" = 'driver' AND NOT target_person."is_demo")) > 0
     ORDER BY transfer."reason"
  `;

/** Баллы на руках у водителей сейчас — сумма кэша водительских счетов не демо-людей (issue #310). */
export const readDriverBalancesTotal = async (client: Executor = db): Promise<bigint> => {
  const rows = await client.$queryRaw<{ total: bigint }[]>`
    SELECT COALESCE(SUM(account."balance"), 0)::bigint AS "total"
      FROM xb.accounts AS account
      JOIN xb.persons  AS person ON person."id" = account."person_id"
     WHERE account."type" = 'driver'
       AND NOT person."is_demo"
  `;

  return rows[0]?.total ?? 0n;
};
