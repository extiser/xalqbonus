import { randomUUID } from 'node:crypto';

import { consola } from 'consola';
import { db } from '#server/db';
import type { Prisma } from '#server/generated/prisma/client';
import { findOffice } from '#server/repositories/offices';
import { insertOrder, insertOrderItems, type OrderRow } from '#server/repositories/orders';
import { findProductsByIds } from '#server/repositories/products';
import { lockStockRows, writeStockMovement } from '#server/repositories/stock';
import { ensureDriverAccount } from '#server/services/points/ensureDriverAccount';
import { getSystemAccount } from '#server/services/points/getSystemAccount';
import { buildOrderSpendIdempotencyKey } from '#server/services/points/idempotencyKey';
import { transferPoints } from '#server/services/points/transfer';
import {
  DuplicateOrderItemError,
  EmptyOrderError,
  InsufficientStockError,
  InvalidOrderQuantityError,
  OfficeUnavailableError,
  OrderCodeCollisionError,
  ProductUnavailableError,
} from '#server/services/orders/errors';
import { generateOrderCode } from '#server/services/orders/orderCode';

/**
 * Оформление заказа за баллы — **одной транзакцией**.
 *
 * Заказ у нас касса: баллы списываются в момент оформления, а не выдачи, и вместе с ними
 * в той же транзакции появляются заказ, его позиции и резерв остатка
 * (docs/decisions.md → «Каталог: заказ — это касса, остаток живёт по офисам»).
 *
 * Частичного результата здесь не бывает и быть не может. Списание без заказа — снятые
 * у водителя баллы без товара; заказ без списания — товар за бесплатно, которому просрочка
 * потом вернула бы никогда не списанные баллы. Поэтому перевод идёт через примитив
 * `transferPoints` в транзакции вызывающего: не хватило баллов — `InsufficientPointsError`,
 * и откатывается всё, включая заказ и резерв.
 *
 * **Порядок блокировок.** Сначала строки остатка, в фиксированном порядке
 * `(office_id, product_id)`, потом счета внутри перевода. Фиксированный порядок обязателен:
 * два оформления, взявшие одни и те же товары в разном порядке, встали бы в дедлок.
 *
 * Повтор защищён ключом `order_spend:<orders.id>`, но на практике двойной тап здесь даёт
 * два разных заказа: идентификатор выдаётся на каждую попытку свой, и второе нажатие — это
 * второй заказ, а не повтор первого. Защита от двойного списания по одному заказу лежит
 * там, где заказ уже существует: в выдаче и отмене.
 */

const log = consola.withTag('orders:place');

/** Сутки. Окно автоотмены — продуктовое решение 13-09-2026 (docs/decisions.md). */
const ORDER_EXPIRES_IN_HOURS = 24;

/** Сколько кодов пробуем, прежде чем признать, что свободного не нашлось. */
const CODE_ATTEMPTS = 3;

export type PlaceOrderItem = {
  productId: string;
  quantity: number;
};

export type PlaceOrderInput = {
  personId: string;
  officeId: string;
  items: PlaceOrderItem[];
  /** Путь, которым пришла операция, — он же `actor` перевода: `mini_app`, `web`. */
  actor: string;
};

export type PlacedOrder = {
  orderId: string;
  /** Сквозной номер для людей: «№ 1042» в истории водителя и на стойке. */
  number: number;
  /** Пять цифр, которые водитель называет в офисе. */
  code: string;
  totalPoints: number;
  expiresAt: Date;
};

type PricedItem = PlaceOrderItem & { unitPoints: number };

/**
 * Проверяет вход до похода в базу: пустой заказ, нецелое количество, один товар дважды.
 *
 * Позиции возвращаются отсортированными по `product_id` — в том порядке, в котором потом
 * берутся блокировки остатка. Сортировка здесь, а не перед блокировкой: порядок обязан
 * совпадать у оформления, выдачи и отмены, и заводить его в трёх местах значит однажды
 * развести их.
 */
const validateItems = (items: PlaceOrderItem[]): PlaceOrderItem[] => {
  if (items.length === 0) {
    throw new EmptyOrderError();
  }

  const seen = new Set<string>();

  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new InvalidOrderQuantityError(item.productId, item.quantity);
    }

    if (seen.has(item.productId)) {
      throw new DuplicateOrderItemError(item.productId);
    }

    seen.add(item.productId);
  }

  return [...items].sort((left, right) => left.productId.localeCompare(right.productId));
};

/** Цена берётся текущая, из каталога, и запоминается позицией заказа. */
const priceItems = async (
  transaction: Prisma.TransactionClient,
  items: PlaceOrderItem[],
): Promise<PricedItem[]> => {
  const products = await findProductsByIds(
    items.map((item) => item.productId),
    transaction,
  );
  // Черновик отсекается здесь, в выборке каталога, тем же условием, что и на витрине:
  // водителю он не виден нигде, и корзина, собранная руками, его тоже не закажет (issue #148).
  // Цена у опубликованного есть всегда — проверкой `products_published_complete_check`.
  const priceByProduct = new Map(
    products.flatMap((product) =>
      product.publishedAt !== null && product.archivedAt === null && product.pricePoints !== null
        ? [[product.id, product.pricePoints] as const]
        : [],
    ),
  );

  return items.map((item) => {
    const unitPoints = priceByProduct.get(item.productId);

    // Нет в каталоге, черновик и архивный — один отказ: водителю во всех случаях нельзя
    // заказать этот товар, а знать, существовал ли он когда-нибудь, ему незачем.
    if (unitPoints === undefined) {
      throw new ProductUnavailableError(item.productId);
    }

    return { ...item, unitPoints };
  });
};

/**
 * Проверяет свободный остаток по уже заблокированным строкам.
 *
 * Строки, которой нет, означает ноль: товар в этот офис ни разу не приходил.
 */
const requireStock = (
  officeId: string,
  items: PricedItem[],
  stock: Awaited<ReturnType<typeof lockStockRows>>,
): void => {
  const onHandByProduct = new Map(stock.map((row) => [row.productId, row.onHand]));

  for (const item of items) {
    const available = onHandByProduct.get(item.productId) ?? 0;

    if (available < item.quantity) {
      throw new InsufficientStockError(officeId, item.productId, item.quantity, available);
    }
  }
};

/**
 * Вставляет заказ, подбирая свободный код.
 *
 * Конфликт частичного индекса гасится `ON CONFLICT … DO NOTHING` в репозитории и приходит
 * сюда пустым результатом, а не исключением: отбитая вставка отравила бы транзакцию целиком,
 * и повторить попытку внутри неё стало бы нельзя.
 */
const insertOrderWithFreshCode = async (
  transaction: Prisma.TransactionClient,
  input: { id: string; personId: string; officeId: string; totalPoints: number; spendTransferId: string },
): Promise<OrderRow> => {
  for (let attempt = 1; attempt <= CODE_ATTEMPTS; attempt += 1) {
    const order = await insertOrder(transaction, {
      ...input,
      code: generateOrderCode(),
      expiresInHours: ORDER_EXPIRES_IN_HOURS,
    });

    if (order) {
      return order;
    }

    log.warn('код заказа занят висящим заказом — пробуем другой', { attempt });
  }

  throw new OrderCodeCollisionError(CODE_ATTEMPTS);
};

export const placeOrder = async (input: PlaceOrderInput): Promise<PlacedOrder> => {
  const items = validateItems(input.items);

  // Счёт и системный счёт читаются до транзакции: ни тот, ни другой не зависят от заказа,
  // а держать на них блокировки всё время проверки каталога незачем.
  const driverAccount = await ensureDriverAccount(input.personId);
  const redemptionAccount = await getSystemAccount('redemption');

  // Идентификатор заказа выдаётся здесь, а не базой: от него строится ключ идемпотентности
  // списания, а перевод записывается раньше заказа — заказ обязан сослаться на него
  // колонкой `spend_transfer_id`. Кольцо замыкается отложенным внешним ключом
  // `point_transfers.order_id`, который база проверяет при фиксации.
  const orderId = randomUUID();
  const occurredAt = new Date();

  return db.$transaction(async (transaction) => {
    const office = await findOffice(input.officeId, transaction);

    if (!office || office.archivedAt !== null) {
      throw new OfficeUnavailableError(input.officeId);
    }

    const pricedItems = await priceItems(transaction, items);

    const stock = await lockStockRows(
      transaction,
      input.officeId,
      pricedItems.map((item) => item.productId),
    );

    requireStock(input.officeId, pricedItems, stock);

    const totalPoints = pricedItems.reduce(
      (sum, item) => sum + item.unitPoints * item.quantity,
      0,
    );

    const { transfer } = await transferPoints({
      reason: 'order_spend',
      idempotencyKey: buildOrderSpendIdempotencyKey(orderId),
      amount: totalPoints,
      fromAccountId: driverAccount.id,
      toAccountId: redemptionAccount.id,
      occurredAt,
      context: { orderId, actor: input.actor },
      client: transaction,
    });

    const order = await insertOrderWithFreshCode(transaction, {
      id: orderId,
      personId: input.personId,
      officeId: input.officeId,
      totalPoints,
      spendTransferId: transfer.id,
    });

    await insertOrderItems(transaction, orderId, pricedItems);

    for (const item of pricedItems) {
      await writeStockMovement(transaction, {
        officeId: input.officeId,
        productId: item.productId,
        kind: 'order_reserve',
        deltaOnHand: -item.quantity,
        deltaReserved: item.quantity,
        orderId,
      });
    }

    log.info('заказ оформлен', {
      orderId,
      number: order.number,
      officeId: input.officeId,
      positions: pricedItems.length,
      totalPoints,
    });

    return {
      orderId,
      number: order.number,
      code: order.code,
      totalPoints,
      expiresAt: order.expiresAt,
    };
  });
};
