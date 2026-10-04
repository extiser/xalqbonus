import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';
import type {
  EmployeeRole,
  OrderCancelReason,
  OrderChannel,
  OrderPayment,
  OrderStatus,
} from '#server/generated/prisma/enums';
import {
  DESK_DRIVER_COLUMNS,
  deskDriverJoins,
  type DeskDriverColumns,
} from '#server/repositories/deskDriver';
import type { OfficeRow } from '#server/repositories/offices';

/**
 * Заказы и их позиции — за баллы и за розницу, из бота и со стойки.
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
  payment: OrderPayment;
  channel: OrderChannel;
  /** Только у заказа бота. */
  code: string | null;
  /** Только у заказа за баллы. */
  totalPoints: number | null;
  /** Только у заказа бота. */
  expiresAt: Date | null;
  /** Только у заказа за баллы. */
  spendTransferId: string | null;
  refundTransferId: string | null;
};

/**
 * Висящий заказ. Висит только заказ бота за баллы — заказ стойки выдан той же операцией,
 * что оформлен (`orders_channel_fields_check`), а в боте платят баллами
 * (`orders_payment_fields_check`), — поэтому код, срок, сумма и перевод списания у него есть
 * всегда. Сужение держит условие `status = 'pending'` в запросе, а не приведение после него.
 */
export type PendingOrderRow = OrderRow & {
  code: string;
  totalPoints: number;
  expiresAt: Date;
  spendTransferId: string;
};

const ORDER_COLUMNS = Prisma.sql`
  "id",
  "number",
  "person_id"          AS "personId",
  "office_id"          AS "officeId",
  "status",
  "payment",
  "channel",
  "code",
  "total_points"       AS "totalPoints",
  "expires_at"         AS "expiresAt",
  "spend_transfer_id"  AS "spendTransferId",
  "refund_transfer_id" AS "refundTransferId"
`;

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
 * Вставляет заказ водителя из бота за баллы в статусе `pending`.
 *
 * `null` означает ровно одно: код уже занят другим висящим заказом. Отказ гасится
 * `ON CONFLICT … DO NOTHING` по частичному уникальному индексу, а не ловится исключением,
 * потому что отбитая вставка отравляет транзакцию целиком — и попытка с новым кодом
 * требовала бы переоткрыть её вместе с уже взятыми блокировками остатка.
 */
export const insertOrder = async (
  client: Prisma.TransactionClient,
  input: InsertOrderInput,
): Promise<PendingOrderRow | null> => {
  const rows = await client.$queryRaw<PendingOrderRow[]>`
    INSERT INTO xb.orders (
      "id", "person_id", "office_id", "status", "payment", "channel", "code",
      "total_points", "expires_at", "spend_transfer_id"
    )
    VALUES (
      ${input.id}::uuid,
      ${input.personId}::uuid,
      ${input.officeId}::uuid,
      'pending'::xb.order_status,
      'points'::xb.order_payment,
      'bot'::xb.order_channel,
      ${input.code},
      ${input.totalPoints},
      now() + make_interval(hours => ${input.expiresInHours}),
      ${input.spendTransferId}::uuid
    )
    ON CONFLICT ("code") WHERE "status" = 'pending' DO NOTHING
    RETURNING ${ORDER_COLUMNS}
  `;

  return rows[0] ?? null;
};

export type InsertDeskOrderInput = {
  /** Идентификатор выдаёт вызывающий — тем же доводом, что у `insertOrder`. */
  id: string;
  personId: string;
  officeId: string;
  payment: OrderPayment;
  /** Только у `points`. */
  totalPoints: number | null;
  /** Только у `retail`. */
  totalRetail: number | null;
  /** Только у `points`. */
  spendTransferId: string | null;
  /** Кто оформил — он же выдал: заказ стойки выдан той же операцией. */
  employeeId: string;
  issuedAt: Date;
};

/**
 * Вставляет заказ стойки — сразу `issued`, без кода и срока.
 *
 * Конфликта кода здесь нет: кода у заказа стойки нет вовсе. Что способ оплаты сходится
 * с суммами и переводом, проверяет база (`orders_payment_fields_check`).
 */
export const insertDeskOrder = async (
  client: Prisma.TransactionClient,
  input: InsertDeskOrderInput,
): Promise<OrderRow> => {
  const rows = await client.$queryRaw<OrderRow[]>`
    INSERT INTO xb.orders (
      "id", "person_id", "office_id", "status", "payment", "channel",
      "total_points", "total_retail", "spend_transfer_id",
      "created_by_employee_id", "issued_at", "issued_by_employee_id"
    )
    VALUES (
      ${input.id}::uuid,
      ${input.personId}::uuid,
      ${input.officeId}::uuid,
      'issued'::xb.order_status,
      ${input.payment}::xb.order_payment,
      'desk'::xb.order_channel,
      ${input.totalPoints}::int,
      ${input.totalRetail}::int,
      ${input.spendTransferId}::uuid,
      ${input.employeeId}::uuid,
      ${input.issuedAt},
      ${input.employeeId}::uuid
    )
    RETURNING ${ORDER_COLUMNS}
  `;

  const order = rows[0];

  if (!order) {
    throw new Error(`заказ стойки ${input.id} не вставился`);
  }

  return order;
};

export type OrderItemInput = {
  productId: string;
  quantity: number;
  /**
   * Цена товара на момент заказа. Дальше она живёт своей жизнью от цены каталога. Заполнена
   * ровно одна из двух — та, которой платит заказ (`order_items_price_check`).
   */
  unitPoints: number | null;
  unitRetail: number | null;
};

/**
 * Позиции заказа, одним запросом: `unnest` разворачивает массивы в строки.
 *
 * Себестоимость берётся здесь же, соединением с каталогом, а не от вызывающего (issue #372):
 * снимок — ровно цена на момент вставки, и сервису передавать её неоткуда. Дальше она живёт
 * своей жизнью от каталога, как `unit_points` и `unit_retail`.
 */
export const insertOrderItems = async (
  client: Prisma.TransactionClient,
  orderId: string,
  items: OrderItemInput[],
): Promise<void> => {
  await client.$executeRaw`
    INSERT INTO xb.order_items (
      "order_id", "product_id", "quantity", "unit_points", "unit_retail", "unit_cost"
    )
    SELECT ${orderId}::uuid, item."productId", item."quantity", item."unitPoints", item."unitRetail",
           product."price_cost"
      FROM unnest(
             ${items.map((item) => item.productId)}::uuid[],
             ${items.map((item) => item.quantity)}::int[],
             ${items.map((item) => item.unitPoints)}::int[],
             ${items.map((item) => item.unitRetail)}::int[]
           ) AS item("productId", "quantity", "unitPoints", "unitRetail")
      -- Левое соединение: несуществующий товар роняет вставку внешним ключом, как прежде,
      -- а не выпадает из заказа молча.
      LEFT JOIN xb.products AS product ON product."id" = item."productId"
  `;
};

export type OrderItemRow = {
  productId: string;
  quantity: number;
  unitPoints: number | null;
  unitRetail: number | null;
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
           "unit_points" AS "unitPoints",
           "unit_retail" AS "unitRetail"
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
): Promise<PendingOrderRow | null> => {
  const rows = await client.$queryRaw<PendingOrderRow[]>`
    SELECT ${ORDER_COLUMNS}
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
    SELECT ${ORDER_COLUMNS}
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
  /** Только у заказа бота: заказ, оформленный у стойки, кода не несёт. */
  code: string | null;
  /** Есть всегда: водителю читаются только заказы за баллы. */
  totalPoints: number;
  /** Только у заказа бота. */
  expiresAt: Date | null;
  issuedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: OrderCancelReason | null;
  /**
   * Офис заказа целиком — водитель едет туда за товаром. Читается у любого заказа, архивный
   * офис тоже: заказ уже случился, и где он был, не меняется.
   */
  office: OfficeRow;
};

/** Строка запроса как она приходит из базы: офис плоскими колонками с приставкой. */
type PersonOrderQueryRow = Omit<PersonOrderRow, 'office'> & {
  officeId: string;
  officeName: string;
  officeAddress: string;
  officeMapUrl: string | null;
  officeWorkHours: string | null;
  officePhoneE164: string | null;
  officeTelegram: string | null;
  officeArchivedAt: Date | null;
  officeIsDemo: boolean;
  officeUpdatedAt: Date;
};

export type ListPersonOrdersInput = {
  personId: string;
  /** Один заказ этого человека. Пусто — все его заказы. */
  orderId: string | null;
  limit: number;
};

/**
 * Заказы человека за баллы: висящие первыми, дальше свежие вперёд.
 *
 * Розничных здесь нет — условием запроса, а не отбором после: это продажа парка, а не операция
 * программы, и водителю она не показывается нигде (docs/decisions.md → «Заказ оформляет
 * сотрудник у стойки: за баллы или за розницу»). Заказ за баллы, оформленный у стойки,
 * здесь есть: баллы с водителя списаны, и он обязан видеть за что.
 *
 * Человек входит в условие всегда, в том числе при поиске одного заказа: чужой заказ
 * отсюда не читается ни при каком идентификаторе, и «свой ли это заказ» отвечает сам
 * запрос, а не сравнение после него.
 */
export const listPersonOrders = async (
  input: ListPersonOrdersInput,
  client: Prisma.TransactionClient = db,
): Promise<PersonOrderRow[]> => {
  const rows = await client.$queryRaw<PersonOrderQueryRow[]>`
    SELECT "order"."id",
           "order"."number",
           "order"."status",
           "order"."code",
           "order"."total_points"  AS "totalPoints",
           "order"."expires_at"    AS "expiresAt",
           "order"."issued_at"     AS "issuedAt",
           "order"."cancelled_at"  AS "cancelledAt",
           "order"."cancel_reason" AS "cancelReason",
           office."id"             AS "officeId",
           office."name"           AS "officeName",
           office."address"        AS "officeAddress",
           office."map_url"        AS "officeMapUrl",
           office."work_hours"     AS "officeWorkHours",
           office."phone_e164"     AS "officePhoneE164",
           office."telegram"       AS "officeTelegram",
           office."archived_at"    AS "officeArchivedAt",
           office."is_demo"        AS "officeIsDemo",
           office."updated_at"     AS "officeUpdatedAt"
      FROM xb.orders AS "order"
      JOIN xb.offices AS office ON office."id" = "order"."office_id"
     WHERE "order"."person_id" = ${input.personId}::uuid
       AND "order"."payment" = 'points'
       AND (${input.orderId}::uuid IS NULL OR "order"."id" = ${input.orderId}::uuid)
     ORDER BY ("order"."status" <> 'pending'), "order"."created_at" DESC
     LIMIT ${input.limit}
  `;

  return rows.map(
    ({
      officeId,
      officeName,
      officeAddress,
      officeMapUrl,
      officeWorkHours,
      officePhoneE164,
      officeTelegram,
      officeArchivedAt,
      officeIsDemo,
      officeUpdatedAt,
      ...order
    }) => ({
      ...order,
      office: {
        id: officeId,
        name: officeName,
        address: officeAddress,
        mapUrl: officeMapUrl,
        workHours: officeWorkHours,
        phoneE164: officePhoneE164,
        telegram: officeTelegram,
        archivedAt: officeArchivedAt,
        isDemo: officeIsDemo,
        updatedAt: officeUpdatedAt,
      },
    }),
  );
};

export type OrderLineRow = {
  orderId: string;
  productId: string;
  name: string;
  quantity: number;
  /** Цена позиции заказа за баллы. */
  unitPoints: number | null;
  /** Цена позиции розничного заказа. */
  unitRetail: number | null;
  /** Фото товара — текущее, из каталога: у позиции своего нет. */
  photoPath: string | null;
  /** Время правки товара — версия адреса фото (`ProductPhoto`). */
  photoUpdatedAt: Date;
};

/** Позиции нескольких заказов с названиями и фото товаров — одним запросом на весь список. */
export const listOrderLines = async (
  orderIds: string[],
  client: Prisma.TransactionClient = db,
): Promise<OrderLineRow[]> =>
  client.$queryRaw<OrderLineRow[]>`
    SELECT item."order_id"    AS "orderId",
           item."product_id"  AS "productId",
           product."name",
           item."quantity",
           item."unit_points" AS "unitPoints",
           item."unit_retail" AS "unitRetail",
           product."photo_path" AS "photoPath",
           product."updated_at" AS "photoUpdatedAt"
      FROM xb.order_items AS item
      JOIN xb.products AS product ON product."id" = item."product_id"
     WHERE item."order_id" = ANY(${orderIds}::uuid[])
     ORDER BY product."name"
  `;

export type OfficeOrderRow = DeskDriverColumns & {
  id: string;
  number: number;
  status: OrderStatus;
  payment: OrderPayment;
  channel: OrderChannel;
  code: string | null;
  officeId: string;
  officeName: string;
  totalPoints: number | null;
  totalRetail: number | null;
  createdAt: Date;
  expiresAt: Date | null;
  issuedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: OrderCancelReason | null;
  /** Сотрудники, работавшие с заказом, — именем и ролью на сейчас. Пусто — сотрудника не было. */
  createdByName: string | null;
  createdByRole: EmployeeRole | null;
  issuedByName: string | null;
  issuedByRole: EmployeeRole | null;
  cancelledByName: string | null;
  cancelledByRole: EmployeeRole | null;
};

/**
 * Заказ глазами сотрудника: сам заказ, офис, водитель с позывным и телефоном и сотрудники,
 * которые его оформили, выдали или отменили (issue #294). Водитель — общим куском
 * `deskDriver.ts`, тем же, что у карточки награды.
 */
const OFFICE_ORDER_SELECT = Prisma.sql`
  SELECT "order"."id",
         "order"."number",
         "order"."status",
         "order"."payment",
         "order"."channel",
         "order"."code",
         "order"."office_id"     AS "officeId",
         office."name"           AS "officeName",
         "order"."total_points"  AS "totalPoints",
         "order"."total_retail"  AS "totalRetail",
         "order"."created_at"    AS "createdAt",
         "order"."expires_at"    AS "expiresAt",
         "order"."issued_at"     AS "issuedAt",
         "order"."cancelled_at"  AS "cancelledAt",
         "order"."cancel_reason" AS "cancelReason",
         creator."full_name"     AS "createdByName",
         creator."role"          AS "createdByRole",
         issuer."full_name"      AS "issuedByName",
         issuer."role"           AS "issuedByRole",
         canceller."full_name"   AS "cancelledByName",
         canceller."role"        AS "cancelledByRole",
         ${DESK_DRIVER_COLUMNS}
    FROM xb.orders AS "order"
    JOIN xb.offices AS office ON office."id" = "order"."office_id"
    LEFT JOIN xb.employees AS creator   ON creator."id" = "order"."created_by_employee_id"
    LEFT JOIN xb.employees AS issuer    ON issuer."id" = "order"."issued_by_employee_id"
    LEFT JOIN xb.employees AS canceller ON canceller."id" = "order"."cancelled_by_employee_id"
    ${deskDriverJoins(Prisma.sql`"order"."person_id"`)}
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
