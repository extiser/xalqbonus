import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';
import type { OrderCancelReason, OrderStatus } from '#server/generated/prisma/enums';

/**
 * Заказы за баллы и их позиции.
 *
 * Все операции над висящим заказом берут его строку `FOR UPDATE` и проверяют статус
 * под блокировкой. Это и есть защита от двойного тапа: две выдачи одного кода, пришедшие
 * разом, выстраиваются в очередь, и вторая видит уже `issued`. Проверка «а не выдан ли
 * он?» без блокировки ломается ровно в этом месте (docs/principles.md →
 * «Идемпотентность вместо аккуратности»).
 *
 * Схема в сыром SQL указывается явно — `xb.orders`, а не `orders`: `?schema=xb` в строке
 * подключения понимает Prisma, а не `pg` (docs/decisions.md → «В сыром SQL схема
 * указывается явно»).
 */

export type OrderRow = {
  id: string;
  /** Сквозной номер для людей. Ключи идемпотентности строятся от `id`, а не от него. */
  number: number;
  personId: string;
  officeId: string;
  status: OrderStatus;
  code: string;
  totalPoints: number;
  expiresAt: Date;
  spendTransferId: string;
  refundTransferId: string | null;
};

export type InsertOrderInput = {
  /**
   * Идентификатор заказа, выданный вызывающим, а не базой.
   *
   * Единственное место в проекте, где uuid приходит из приложения, и причина та же, что
   * у отложенного внешнего ключа: ключ идемпотентности списания строится от `orders.id`,
   * а перевод записывается раньше заказа — заказ обязан сослаться на него колонкой
   * `spend_transfer_id`. Значит идентификатор должен быть известен до вставки.
   */
  id: string;
  personId: string;
  officeId: string;
  code: string;
  totalPoints: number;
  spendTransferId: string;
  /** Сколько часов заказ висит. Срок считает база, чтобы время было одним на все заказы. */
  expiresInHours: number;
};

/**
 * Вставляет заказ в статусе `pending`.
 *
 * `null` означает ровно одно: код уже занят другим висящим заказом. Отказ гасится
 * `ON CONFLICT … DO NOTHING` по частичному уникальному индексу, а не ловится исключением,
 * потому что отбитая вставка отравляет транзакцию целиком — и попытка с новым кодом
 * требовала бы переоткрыть её вместе с уже взятыми блокировками остатка.
 */
export const insertOrder = async (
  client: Prisma.TransactionClient,
  input: InsertOrderInput,
): Promise<OrderRow | null> => {
  const rows = await client.$queryRaw<OrderRow[]>`
    INSERT INTO xb.orders (
      "id", "person_id", "office_id", "status", "code",
      "total_points", "expires_at", "spend_transfer_id"
    )
    VALUES (
      ${input.id}::uuid,
      ${input.personId}::uuid,
      ${input.officeId}::uuid,
      'pending'::xb.order_status,
      ${input.code},
      ${input.totalPoints},
      now() + make_interval(hours => ${input.expiresInHours}),
      ${input.spendTransferId}::uuid
    )
    ON CONFLICT ("code") WHERE "status" = 'pending' DO NOTHING
    RETURNING "id",
              "number",
              "person_id"          AS "personId",
              "office_id"          AS "officeId",
              "status",
              "code",
              "total_points"       AS "totalPoints",
              "expires_at"         AS "expiresAt",
              "spend_transfer_id"  AS "spendTransferId",
              "refund_transfer_id" AS "refundTransferId"
  `;

  return rows[0] ?? null;
};

export type OrderItemInput = {
  productId: string;
  quantity: number;
  /** Цена товара на момент заказа. Дальше она живёт своей жизнью от цены каталога. */
  unitPoints: number;
};

/** Позиции заказа, одним запросом: `unnest` разворачивает три массива в строки. */
export const insertOrderItems = async (
  client: Prisma.TransactionClient,
  orderId: string,
  items: OrderItemInput[],
): Promise<void> => {
  await client.$executeRaw`
    INSERT INTO xb.order_items ("order_id", "product_id", "quantity", "unit_points")
    SELECT ${orderId}::uuid, "productId", "quantity", "unitPoints"
      FROM unnest(
             ${items.map((item) => item.productId)}::uuid[],
             ${items.map((item) => item.quantity)}::int[],
             ${items.map((item) => item.unitPoints)}::int[]
           ) AS item("productId", "quantity", "unitPoints")
  `;
};

export type OrderItemRow = {
  productId: string;
  quantity: number;
  unitPoints: number;
};

/**
 * Позиции заказа в порядке `product_id`.
 *
 * Порядок не для показа, а для блокировок: выдача и отмена берут по этим товарам строки
 * остатка, и брать их надо в том же порядке, в котором их берёт оформление.
 */
export const listOrderItems = async (
  client: Prisma.TransactionClient,
  orderId: string,
): Promise<OrderItemRow[]> =>
  client.$queryRaw<OrderItemRow[]>`
    SELECT "product_id"  AS "productId",
           "quantity",
           "unit_points" AS "unitPoints"
      FROM xb.order_items
     WHERE "order_id" = ${orderId}::uuid
     ORDER BY "product_id"
  `;

/**
 * Висящий заказ по идентификатору, под блокировку.
 *
 * `status = 'pending'` стоит в условии, а не проверяется после: две выдачи, пришедшие разом,
 * выстраиваются в очередь на строке, и вторая после ожидания перечитывает условие на новой
 * версии строки — заказ уже `issued`, и строки ей не достаётся.
 *
 * По идентификатору, а не по коду: код висящего заказа освобождается выдачей и может
 * достаться новому заказу того же офиса, и выдача по коду, прочитанному секундой раньше,
 * выдала бы чужой заказ.
 */
export const lockPendingOrderById = async (
  client: Prisma.TransactionClient,
  orderId: string,
): Promise<OrderRow | null> => {
  const rows = await client.$queryRaw<OrderRow[]>`
    SELECT "id",
           "number",
           "person_id"          AS "personId",
           "office_id"          AS "officeId",
           "status",
           "code",
           "total_points"       AS "totalPoints",
           "expires_at"         AS "expiresAt",
           "spend_transfer_id"  AS "spendTransferId",
           "refund_transfer_id" AS "refundTransferId"
      FROM xb.orders
     WHERE "id" = ${orderId}::uuid
       AND "status" = 'pending'
       FOR UPDATE
  `;

  return rows[0] ?? null;
};

/** Заказ по идентификатору, под блокировку. Статус проверяет вызывающий — уже под ней. */
export const lockOrderById = async (
  client: Prisma.TransactionClient,
  orderId: string,
): Promise<OrderRow | null> => {
  const rows = await client.$queryRaw<OrderRow[]>`
    SELECT "id",
           "number",
           "person_id"          AS "personId",
           "office_id"          AS "officeId",
           "status",
           "code",
           "total_points"       AS "totalPoints",
           "expires_at"         AS "expiresAt",
           "spend_transfer_id"  AS "spendTransferId",
           "refund_transfer_id" AS "refundTransferId"
      FROM xb.orders
     WHERE "id" = ${orderId}::uuid
       FOR UPDATE
  `;

  return rows[0] ?? null;
};

/**
 * Переводит заказ в `issued`.
 *
 * `status = 'pending'` остаётся в условии, хотя статус уже проверен под блокировкой:
 * условие стоит рядом с записью и не зависит от того, что вызывающий сделал до него.
 * Возвращается число изменённых строк — ноль означает, что заказ перестал быть висящим.
 */
export const markOrderIssued = async (
  client: Prisma.TransactionClient,
  orderId: string,
  employeeId: string,
  issuedAt: Date,
): Promise<number> =>
  client.$executeRaw`
    UPDATE xb.orders
       SET "status" = 'issued'::xb.order_status,
           "issued_at" = ${issuedAt},
           "issued_by_employee_id" = ${employeeId}::uuid,
           "updated_at" = now()
     WHERE "id" = ${orderId}::uuid AND "status" = 'pending'
  `;

export type MarkOrderCancelledInput = {
  orderId: string;
  reason: OrderCancelReason;
  /** Только у причины `employee`: у отмены водителем и у просрочки человека не было. */
  employeeId: string | null;
  refundTransferId: string;
  cancelledAt: Date;
};

export const markOrderCancelled = async (
  client: Prisma.TransactionClient,
  input: MarkOrderCancelledInput,
): Promise<number> =>
  client.$executeRaw`
    UPDATE xb.orders
       SET "status" = 'cancelled'::xb.order_status,
           "cancelled_at" = ${input.cancelledAt},
           "cancel_reason" = ${input.reason}::xb.order_cancel_reason,
           "cancelled_by_employee_id" = ${input.employeeId}::uuid,
           "refund_transfer_id" = ${input.refundTransferId}::uuid,
           "updated_at" = now()
     WHERE "id" = ${input.orderId}::uuid AND "status" = 'pending'
  `;

export type PersonOrderRow = {
  id: string;
  number: number;
  status: OrderStatus;
  code: string;
  totalPoints: number;
  expiresAt: Date;
  issuedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: OrderCancelReason | null;
  officeName: string;
  officeAddress: string;
};

export type ListPersonOrdersInput = {
  personId: string;
  /** Один заказ этого человека. Пусто — все его заказы. */
  orderId: string | null;
  limit: number;
};

/**
 * Заказы человека: висящие первыми, дальше свежие вперёд.
 *
 * Человек входит в условие всегда, в том числе при поиске одного заказа: чужой заказ
 * отсюда не читается ни при каком идентификаторе, и «свой ли это заказ» отвечает сам
 * запрос, а не сравнение после него.
 */
export const listPersonOrders = async (
  input: ListPersonOrdersInput,
  client: Prisma.TransactionClient = db,
): Promise<PersonOrderRow[]> =>
  client.$queryRaw<PersonOrderRow[]>`
    SELECT "order"."id",
           "order"."number",
           "order"."status",
           "order"."code",
           "order"."total_points"  AS "totalPoints",
           "order"."expires_at"    AS "expiresAt",
           "order"."issued_at"     AS "issuedAt",
           "order"."cancelled_at"  AS "cancelledAt",
           "order"."cancel_reason" AS "cancelReason",
           office."name"           AS "officeName",
           office."address"        AS "officeAddress"
      FROM xb.orders AS "order"
      JOIN xb.offices AS office ON office."id" = "order"."office_id"
     WHERE "order"."person_id" = ${input.personId}::uuid
       AND (${input.orderId}::uuid IS NULL OR "order"."id" = ${input.orderId}::uuid)
     ORDER BY ("order"."status" <> 'pending'), "order"."created_at" DESC
     LIMIT ${input.limit}
  `;

export type OrderLineRow = {
  orderId: string;
  productId: string;
  name: string;
  quantity: number;
  unitPoints: number;
};

/** Позиции нескольких заказов с названиями товаров — одним запросом на весь список. */
export const listOrderLines = async (
  orderIds: string[],
  client: Prisma.TransactionClient = db,
): Promise<OrderLineRow[]> =>
  client.$queryRaw<OrderLineRow[]>`
    SELECT item."order_id"    AS "orderId",
           item."product_id"  AS "productId",
           product."name",
           item."quantity",
           item."unit_points" AS "unitPoints"
      FROM xb.order_items AS item
      JOIN xb.products AS product ON product."id" = item."product_id"
     WHERE item."order_id" = ANY(${orderIds}::uuid[])
     ORDER BY product."name"
  `;

export type OfficeOrderRow = {
  id: string;
  number: number;
  status: OrderStatus;
  code: string;
  officeId: string;
  officeName: string;
  totalPoints: number;
  createdAt: Date;
  expiresAt: Date;
  issuedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: OrderCancelReason | null;
  /** Из профиля парка. Пусто, если у человека профиля нет или поле в реестре не заполнено. */
  firstName: string | null;
  lastName: string | null;
  callsign: string | null;
};

/**
 * Заказ глазами сотрудника: сам заказ, офис и водитель с позывным.
 *
 * Профилей у человека бывает несколько, и берётся тот же, по которому его называет бот:
 * работающий, а из них свежайший (`findDisplayProfile`). Своего правила выбора профиля здесь
 * нет — два правила однажды назвали бы одного водителя двумя именами.
 */
const OFFICE_ORDER_SELECT = Prisma.sql`
  SELECT "order"."id",
         "order"."number",
         "order"."status",
         "order"."code",
         "order"."office_id"     AS "officeId",
         office."name"           AS "officeName",
         "order"."total_points"  AS "totalPoints",
         "order"."created_at"    AS "createdAt",
         "order"."expires_at"    AS "expiresAt",
         "order"."issued_at"     AS "issuedAt",
         "order"."cancelled_at"  AS "cancelledAt",
         "order"."cancel_reason" AS "cancelReason",
         profile."first_name"    AS "firstName",
         profile."last_name"     AS "lastName",
         profile."callsign"
    FROM xb.orders AS "order"
    JOIN xb.offices AS office ON office."id" = "order"."office_id"
    LEFT JOIN LATERAL (
      SELECT candidate."first_name",
             candidate."last_name",
             candidate."callsign"
        FROM xb.park_profiles AS candidate
       WHERE candidate."person_id" = "order"."person_id"
       ORDER BY (candidate."work_status" = 'working') DESC, candidate."api_updated_at" DESC
       LIMIT 1
    ) AS profile ON true
`;

export type OfficeOrdersFilter = {
  officeId: string;
  /** Пусто — все статусы. */
  status: OrderStatus | null;
};

const officeOrdersCondition = (filter: OfficeOrdersFilter): Prisma.Sql => Prisma.sql`
  "order"."office_id" = ${filter.officeId}::uuid
  AND (${filter.status}::xb.order_status IS NULL OR "order"."status" = ${filter.status}::xb.order_status)
`;

/**
 * Заказы офиса страницей: висящие первыми, дальше свежие вперёд.
 *
 * Офис входит в условие всегда: заказы без офиса отсюда не читаются, и «чей это офис»
 * решает вызывающий до запроса, а не фильтр после него.
 */
export const listOfficeOrders = async (
  filter: OfficeOrdersFilter & { limit: number; offset: number },
  client: Prisma.TransactionClient = db,
): Promise<OfficeOrderRow[]> =>
  client.$queryRaw<OfficeOrderRow[]>`
    ${OFFICE_ORDER_SELECT}
     WHERE ${officeOrdersCondition(filter)}
     ORDER BY ("order"."status" <> 'pending'), "order"."created_at" DESC
     LIMIT ${filter.limit}
    OFFSET ${filter.offset}
  `;

export const countOfficeOrders = async (
  filter: OfficeOrdersFilter,
  client: Prisma.TransactionClient = db,
): Promise<number> => {
  const rows = await client.$queryRaw<{ total: number }[]>`
    SELECT count(*)::int AS "total"
      FROM xb.orders AS "order"
     WHERE ${officeOrdersCondition(filter)}
  `;

  return rows[0]?.total ?? 0;
};

/** Один заказ по идентификатору — без блокировки: это чтение для экрана и для проверки офиса. */
export const findOfficeOrder = async (
  orderId: string,
  client: Prisma.TransactionClient = db,
): Promise<OfficeOrderRow | null> => {
  const rows = await client.$queryRaw<OfficeOrderRow[]>`
    ${OFFICE_ORDER_SELECT}
     WHERE "order"."id" = ${orderId}::uuid
  `;

  return rows[0] ?? null;
};

/**
 * Висящий заказ по коду **и офису** — без блокировки.
 *
 * Офис входит в условие, а не проверяется после: код не должен подтверждать существование
 * заказа тому, кто стоит не в том офисе. «Заказ оформлен в другом офисе» — это подтверждение
 * кода тому, кто стоит не там.
 */
export const findPendingOfficeOrderByCode = async (
  officeId: string,
  code: string,
  client: Prisma.TransactionClient = db,
): Promise<OfficeOrderRow | null> => {
  const rows = await client.$queryRaw<OfficeOrderRow[]>`
    ${OFFICE_ORDER_SELECT}
     WHERE "order"."code" = ${code}
       AND "order"."office_id" = ${officeId}::uuid
       AND "order"."status" = 'pending'
  `;

  return rows[0] ?? null;
};

/**
 * Висящие заказы с истёкшим сроком — вход воркера просрочки.
 *
 * Возвращаются только идентификаторы и номера: каждый заказ отменяется своей транзакцией,
 * и прочитанное здесь состояние к моменту отмены уже неактуально — оно перечитывается
 * под блокировкой.
 *
 * Срок сравнивается с `now()` базы, а не с временем приложения: заказ и его срок пишет
 * база, и сверять их надо её часами.
 */
export const listExpiredPendingOrders = async (
  limit: number,
): Promise<{ id: string; number: number }[]> =>
  db.$queryRaw<{ id: string; number: number }[]>`
    SELECT "id", "number"
      FROM xb.orders
     WHERE "status" = 'pending' AND "expires_at" < now()
     ORDER BY "expires_at"
     LIMIT ${limit}
  `;
