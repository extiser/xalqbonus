import { consola } from 'consola';
import { db } from '#server/db';
import type { OrderCancelReason } from '#server/generated/prisma/enums';
import {
  listOrderItems,
  lockOrderById,
  markOrderCancelled,
} from '#server/repositories/orders';
import { lockStockRows, writeStockMovement } from '#server/repositories/stock';
import { ensureDriverAccount } from '#server/services/points/ensureDriverAccount';
import { getSystemAccount } from '#server/services/points/getSystemAccount';
import { buildOrderRefundIdempotencyKey } from '#server/services/points/idempotencyKey';
import { transferPoints } from '#server/services/points/transfer';
import {
  CancelAuthorMismatchError,
  OrderNotPendingError,
  UnknownOrderError,
} from '#server/services/orders/errors';

/**
 * Отмена заказа — одной транзакцией: резерв возвращается в свободный остаток, баллы
 * возвращаются водителю переводом `order_refund:<orders.id>` на всю сумму заказа.
 *
 * Отмена водителем, сотрудником и просрочкой — **этот же сервис** с разной причиной.
 * Трёх путей возврата баллов не бывает: ровно на этом старый бот возвращал баллы столько
 * раз, сколько нажали кнопку.
 *
 * Проверку «свой ли это заказ» делает ручка: сервис принимает решение уже проверенным.
 * Здесь проверяется только то, что без блокировки проверить нельзя, — висит ли заказ.
 *
 * Повтор безопасен дважды. Статус читается и меняется под блокировкой строки, поэтому
 * вторая отмена видит `cancelled` и не делает ничего; а если бы дошла до перевода, её
 * остановил бы ключ идемпотентности — баллы не вернулись бы второй раз ни при каком порядке
 * событий.
 */

const log = consola.withTag('orders:cancel');

export type CancelOrderInput = {
  orderId: string;
  reason: OrderCancelReason;
  /**
   * Сотрудник, отменяющий заказ. Обязателен у причины `employee` и запрещён у остальных:
   * отмену водителем сделал водитель, просрочку — воркер, и человека там не было.
   * Это же правило стоит проверкой `orders_cancel_author_check` в базе.
   */
  employeeId?: string | null;
};

export type CancelledOrder = {
  orderId: string;
  number: number;
  personId: string;
  /** Сколько баллов вернулось. Равно сумме заказа: возврат всегда полный. */
  refundedPoints: number;
  cancelledAt: Date;
};

const requireAuthor = (input: CancelOrderInput): string | null => {
  const employeeId = input.employeeId ?? null;

  if ((input.reason === 'employee') !== (employeeId !== null)) {
    throw new CancelAuthorMismatchError(input.reason);
  }

  return employeeId;
};

export const cancelOrder = async (input: CancelOrderInput): Promise<CancelledOrder> => {
  const employeeId = requireAuthor(input);
  const redemptionAccount = await getSystemAccount('redemption');

  return db.$transaction(async (transaction) => {
    const order = await lockOrderById(transaction, input.orderId);

    if (!order) {
      throw new UnknownOrderError(input.orderId);
    }

    if (order.status !== 'pending') {
      throw new OrderNotPendingError(order.id, order.status);
    }

    const items = await listOrderItems(transaction, order.id);

    // Порядок `product_id` — тот же, в котором строки берёт оформление.
    await lockStockRows(
      transaction,
      order.officeId,
      items.map((item) => item.productId),
    );

    for (const item of items) {
      await writeStockMovement(transaction, {
        officeId: order.officeId,
        productId: item.productId,
        kind: 'order_release',
        deltaOnHand: item.quantity,
        deltaReserved: -item.quantity,
        orderId: order.id,
        employeeId,
      });
    }

    // Счёт водителя точно есть: с него ушло списание при оформлении. Вызов всё равно
    // идёт через `ensureDriverAccount` — второго способа получить водительский счёт
    // в проекте нет, и заводить его здесь значило бы развести их однажды.
    const driverAccount = await ensureDriverAccount(order.personId, transaction);
    const cancelledAt = new Date();

    const { transfer } = await transferPoints({
      reason: 'order_refund',
      idempotencyKey: buildOrderRefundIdempotencyKey(order.id),
      amount: order.totalPoints,
      fromAccountId: redemptionAccount.id,
      toAccountId: driverAccount.id,
      occurredAt: cancelledAt,
      context: { orderId: order.id, actor: input.reason },
      client: transaction,
    });

    const updated = await markOrderCancelled(transaction, {
      orderId: order.id,
      reason: input.reason,
      employeeId,
      refundTransferId: transfer.id,
      cancelledAt,
    });

    // Недостижимо под блокировкой строки — см. то же место в `issueOrder`.
    if (updated !== 1) {
      throw new Error(`отмена заказа ${order.id} не изменила ни одной строки`);
    }

    log.info('заказ отменён', {
      orderId: order.id,
      number: order.number,
      reason: input.reason,
      refundedPoints: order.totalPoints,
    });

    return {
      orderId: order.id,
      number: order.number,
      personId: order.personId,
      refundedPoints: order.totalPoints,
      cancelledAt,
    };
  });
};
