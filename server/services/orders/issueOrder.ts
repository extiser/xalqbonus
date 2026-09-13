import { consola } from 'consola';
import { db } from '#server/db';
import {
  listOrderItems,
  lockPendingOrderById,
  markOrderIssued,
} from '#server/repositories/orders';
import { lockStockRows, writeStockMovement } from '#server/repositories/stock';
import { OrderNotFoundError } from '#server/services/orders/errors';

/**
 * Выдача заказа в офисе — одной транзакцией.
 *
 * **Переводов выдача не делает.** Баллы погашены при оформлении, и выдача меняет ровно две
 * вещи: статус заказа и остаток офиса, с которого снимается резерв
 * (docs/decisions.md → «Каталог: заказ — это касса, остаток живёт по офисам»).
 *
 * Заказ берётся **по идентификатору**, а не по коду. Код — то, чем заказ находят у стойки;
 * выдают то, что нашли и показали. Код висящего заказа освобождается выдачей и может
 * достаться новому заказу того же офиса, и выдача по коду, прочитанному секундой раньше,
 * выдала бы в закоммиченной транзакции чужой заказ — порчу данных, а не отказ.
 *
 * Открыт ли офис заказа сотруднику, проверяет вызывающий (`issueOfficeOrder`): сервис
 * принимает решение уже проверенным, как `cancelOrder`.
 *
 * Двойной тап штатен. Второе нажатие не находит висящего заказа и получает
 * `OrderNotFoundError`, не сделав ни одной записи. Две выдачи, пришедшие разом, разводит
 * блокировка строки заказа: вторая ждёт первую и видит уже `issued`.
 */

const log = consola.withTag('orders:issue');

export type IssueOrderInput = {
  orderId: string;
  employeeId: string;
};

export type IssuedOrder = {
  orderId: string;
  number: number;
  personId: string;
  totalPoints: number;
  issuedAt: Date;
};

export const issueOrder = async (input: IssueOrderInput): Promise<IssuedOrder> =>
  db.$transaction(async (transaction) => {
    const order = await lockPendingOrderById(transaction, input.orderId);

    if (!order) {
      throw new OrderNotFoundError(input.orderId);
    }

    const items = await listOrderItems(transaction, order.id);

    // Строки остатка берутся в порядке `product_id` — том же, в котором их берёт
    // оформление. Порядок фиксирован, чтобы выдача и оформление не встали в дедлок
    // на общих товарах.
    await lockStockRows(
      transaction,
      order.officeId,
      items.map((item) => item.productId),
    );

    const issuedAt = new Date();
    const updated = await markOrderIssued(transaction, order.id, input.employeeId, issuedAt);

    // Под блокировкой строки это недостижимо: статус прочитан и изменён в одной транзакции.
    // Ноль здесь означал бы, что строку правит кто-то мимо блокировки, — и тогда снимать
    // резерв нельзя.
    if (updated !== 1) {
      throw new Error(`выдача заказа ${order.id} не изменила ни одной строки`);
    }

    for (const item of items) {
      await writeStockMovement(transaction, {
        officeId: order.officeId,
        productId: item.productId,
        kind: 'order_issue',
        deltaOnHand: 0,
        deltaReserved: -item.quantity,
        orderId: order.id,
        employeeId: input.employeeId,
      });
    }

    log.info('заказ выдан', {
      orderId: order.id,
      number: order.number,
      officeId: order.officeId,
      positions: items.length,
    });

    return {
      orderId: order.id,
      number: order.number,
      personId: order.personId,
      totalPoints: order.totalPoints,
      issuedAt,
    };
  });
