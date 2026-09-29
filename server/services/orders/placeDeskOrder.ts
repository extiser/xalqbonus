import { randomUUID } from 'node:crypto';

import { consola } from 'consola';
import { db } from '#server/db';
import type { Prisma } from '#server/generated/prisma/client';
import type { OrderPayment } from '#server/generated/prisma/enums';
import { findDeskCustomer } from '#server/repositories/drivers';
import { findOffice } from '#server/repositories/offices';
import { insertDeskOrder, insertOrderItems } from '#server/repositories/orders';
import { findProductsByIds } from '#server/repositories/products';
import { lockStockRows, writeStockMovement } from '#server/repositories/stock';
import { requireOpenOffice, type OfficeWorker } from '#server/services/offices/employeeOffices';
import {
  DriverFiredError,
  DriverUnavailableError,
  DriverWithoutAccountError,
  OfficeUnavailableError,
  ProductNotForRetailError,
  ProductUnavailableError,
} from '#server/services/orders/errors';
import {
  requireOrderStock,
  validateOrderItems,
  type OrderItemRequest,
} from '#server/services/orders/orderItems';
import { getSystemAccount } from '#server/services/points/getSystemAccount';
import { buildOrderSpendIdempotencyKey } from '#server/services/points/idempotencyKey';
import { transferPoints } from '#server/services/points/transfer';

/**
 * Заказ, оформленный сотрудником у стойки за водителя, — **одной транзакцией**, и сразу выданный.
 *
 * Водитель стоит перед сотрудником, поэтому кода, резерва на сутки и автоотмены у такого заказа
 * нет: товар уходит из остатка офиса той же операцией (docs/decisions.md → «Заказ оформляет
 * сотрудник у стойки: за баллы или за розницу»).
 *
 * **Способов оплаты два, и они не смешиваются.** За баллы — по цене в баллах, переводом водитель
 * → `redemption` с ключом `order_spend:<orders.id>`, как у заказа из бота; только тому, у кого
 * есть счёт водителя. За розницу — по розничной цене в сумах, переводов нет вовсе: деньги система
 * не принимает, а записывает; продаётся любому водителю реестра.
 *
 * **Журнал остатков — теми же двумя движениями, что у заказа бота:** `order_reserve`, затем
 * `order_issue`. Резерв после операции тот же, что до, и три запроса остатков
 * из `scripts/invariants.sql` держатся без правок: каждое движение заказа по-прежнему значит
 * одно и то же, а выданный заказ резерва не занимает.
 *
 * **Порядок блокировок тот же, что у `placeOrder`:** строки остатка в порядке
 * `(office_id, product_id)`, потом счета внутри перевода. Иначе оформление у стойки и в боте
 * встали бы в дедлок на общих товарах.
 *
 * Повтор: идентификатор заказа выдаётся на каждую попытку свой, и второе нажатие «Оформить» —
 * это второй заказ. Отличить его от намеренного второго заказа сервер не может, поэтому кнопку
 * держит экран, пока идёт запрос.
 */

const log = consola.withTag('orders:desk');

export type PlaceDeskOrderInput = {
  officeId: string;
  personId: string;
  payment: OrderPayment;
  items: OrderItemRequest[];
  /** Путь, которым пришла операция, — он же `actor` перевода: `web`. */
  actor: string;
};

export type PlacedDeskOrder = {
  orderId: string;
  number: number;
  payment: OrderPayment;
  /** Только у `points`. */
  totalPoints: number | null;
  /** Только у `retail`. */
  totalRetail: number | null;
};

type PricedDeskItem = OrderItemRequest & { unitPoints: number | null; unitRetail: number | null };

/** Счета перевода списания — только у заказа за баллы. */
type SpendAccounts = { driverAccountId: string; redemptionAccountId: string };

/**
 * Цена каждой позиции — текущая, из каталога, в валюте способа оплаты; запоминается позицией.
 *
 * Отбор — опубликованный, не архивный, своей стороны демо: живому офису демо-товар
 * не продаётся, демо-офису живой — продаётся, как демо-водителю в боте (issue #212). Скрытый
 * с витрины товар стойка продаёт: признак прячет его от водителя в Mini App, а на полке офиса
 * он лежит, как любой другой.
 */
const priceDeskItems = async (
  transaction: Prisma.TransactionClient,
  items: OrderItemRequest[],
  payment: OrderPayment,
  officeIsDemo: boolean,
): Promise<PricedDeskItem[]> => {
  const products = new Map(
    (await findProductsByIds(items.map((item) => item.productId), transaction)).map((product) => [
      product.id,
      product,
    ]),
  );

  return items.map((item) => {
    const product = products.get(item.productId);

    if (
      !product ||
      product.publishedAt === null ||
      product.archivedAt !== null ||
      (product.isDemo && !officeIsDemo)
    ) {
      throw new ProductUnavailableError(item.productId);
    }

    if (payment === 'points') {
      // Приз без цены в баллах за баллы не продаётся: цены нет.
      if (product.pricePoints === null) {
        throw new ProductUnavailableError(item.productId);
      }

      return { ...item, unitPoints: product.pricePoints, unitRetail: null };
    }

    if (product.priceRetail === null || product.priceRetail <= 0) {
      throw new ProductNotForRetailError(item.productId);
    }

    return { ...item, unitPoints: null, unitRetail: product.priceRetail };
  });
};

const sumItems = (items: PricedDeskItem[], price: (item: PricedDeskItem) => number | null): number =>
  items.reduce((sum, item) => sum + (price(item) ?? 0) * item.quantity, 0);

export const placeDeskOrder = async (
  worker: OfficeWorker,
  input: PlaceDeskOrderInput,
): Promise<PlacedDeskOrder> => {
  const items = validateOrderItems(input.items);

  // Правило офисов — то же, что у выдачи: менеджеру только его офисы, всем — только своей
  // стороны демо. Чужой — `OfficeNotOpenError`, как у любой ручки стойки.
  await requireOpenOffice(worker, input.officeId);

  const customer = await findDeskCustomer(input.personId);

  if (!customer || customer.hidden || customer.isDemo !== worker.isDemo) {
    throw new DriverUnavailableError(input.personId);
  }

  if (customer.fired) {
    throw new DriverFiredError(input.personId);
  }

  // Счёт не заводится здесь, в отличие от заказа из бота: за баллы оформляется тому, у кого
  // баллы уже есть где лежать, а завести пустой счёт ради отказа «не хватает баллов» незачем.
  let spendAccounts: SpendAccounts | null = null;

  if (input.payment === 'points') {
    if (customer.accountId === null) {
      throw new DriverWithoutAccountError(input.personId);
    }

    spendAccounts = {
      driverAccountId: customer.accountId,
      redemptionAccountId: (await getSystemAccount('redemption')).id,
    };
  }

  // Идентификатор выдаётся здесь, а не базой, — тем же доводом, что в `placeOrder`: от него
  // строится ключ списания, а перевод записывается раньше заказа.
  const orderId = randomUUID();
  const issuedAt = new Date();

  return db.$transaction(async (transaction) => {
    const office = await findOffice(input.officeId, transaction);

    // Офис перечитывается в транзакции: архивировать его могли между проверкой правила офисов
    // и оформлением. Сторона уже решена правилом офисов, здесь она — вторая линия.
    if (!office || office.archivedAt !== null || office.isDemo !== worker.isDemo) {
      throw new OfficeUnavailableError(input.officeId);
    }

    const pricedItems = await priceDeskItems(transaction, items, input.payment, office.isDemo);

    const stock = await lockStockRows(
      transaction,
      input.officeId,
      pricedItems.map((item) => item.productId),
    );

    requireOrderStock(input.officeId, pricedItems, stock);

    let totalPoints: number | null = null;
    let totalRetail: number | null = null;
    let spendTransferId: string | null = null;

    if (spendAccounts) {
      totalPoints = sumItems(pricedItems, (item) => item.unitPoints);

      // Не хватило баллов — `InsufficientPointsError`, и откатывается всё, включая движения.
      const { transfer } = await transferPoints({
        reason: 'order_spend',
        idempotencyKey: buildOrderSpendIdempotencyKey(orderId),
        amount: totalPoints,
        fromAccountId: spendAccounts.driverAccountId,
        toAccountId: spendAccounts.redemptionAccountId,
        occurredAt: issuedAt,
        context: { orderId, actor: input.actor },
        client: transaction,
      });

      spendTransferId = transfer.id;
    } else {
      totalRetail = sumItems(pricedItems, (item) => item.unitRetail);
    }

    const order = await insertDeskOrder(transaction, {
      id: orderId,
      personId: input.personId,
      officeId: input.officeId,
      payment: input.payment,
      totalPoints,
      totalRetail,
      spendTransferId,
      employeeId: worker.employeeId,
      issuedAt,
    });

    await insertOrderItems(transaction, orderId, pricedItems);

    // Оба движения по каждой позиции, в порядке позиций: резерв и тут же выдача. Автор —
    // сотрудник, оформивший заказ: у стойки товар отдал он.
    for (const item of pricedItems) {
      await writeStockMovement(transaction, {
        officeId: input.officeId,
        productId: item.productId,
        kind: 'order_reserve',
        deltaOnHand: -item.quantity,
        deltaReserved: item.quantity,
        orderId,
        employeeId: worker.employeeId,
      });

      await writeStockMovement(transaction, {
        officeId: input.officeId,
        productId: item.productId,
        kind: 'order_issue',
        deltaOnHand: 0,
        deltaReserved: -item.quantity,
        orderId,
        employeeId: worker.employeeId,
      });
    }

    log.info('заказ стойки оформлен и выдан', {
      orderId,
      number: order.number,
      officeId: input.officeId,
      payment: input.payment,
      positions: pricedItems.length,
      totalPoints,
      totalRetail,
    });

    return {
      orderId,
      number: order.number,
      payment: input.payment,
      totalPoints,
      totalRetail,
    };
  });
};
