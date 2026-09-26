import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { buildOrderRefundIdempotencyKey } from '#server/services/points/idempotencyKey';
import { cancelOrder } from '#server/services/orders/cancelOrder';
import {
  CancelAuthorMismatchError,
  OrderNotFoundError,
  OrderNotPendingError,
} from '#server/services/orders/errors';
import { issueOrder } from '#server/services/orders/issueOrder';
import { placeOrder, type PlacedOrder } from '#server/services/orders/placeOrder';
import { receiveStock } from '#server/services/stock/receiveStock';
import {
  cleanupTestData,
  countTransfersByKey,
  countTransfersByReason,
  createTestOffice,
  createTestPerson,
  createTestProduct,
  disconnectDatabase,
  listStockMovements,
  readAccountBalance,
  readOrder,
  readStock,
  readTransfer,
} from '../support/database';
import { cleanupTestEmployees, createTestEmployee } from '../support/employees';
import { grantPoints } from '../support/points';

/**
 * Выдача и отмена заказа.
 *
 * Выдача переводов не делает — баллы погашены при оформлении; отмена возвращает их целиком
 * и освобождает резерв. Повторный вызов любой из двух операций не делает второй:
 * статус читается и меняется под блокировкой строки заказа.
 */

type Scenario = {
  personId: string;
  employeeId: string;
  officeId: string;
  productId: string;
  order: PlacedOrder;
};

/** Водитель с сотней баллов, офис с пятью штуками товара по 40 и висящий заказ на две. */
const placeScenario = async (): Promise<Scenario> => {
  const person = await createTestPerson({ inProgram: true });
  const { employeeId } = await createTestEmployee({ role: 'manager' });
  const officeId = await createTestOffice();
  const productId = await createTestProduct({ pricePoints: 40 });

  await grantPoints(person.personId, 100);
  await receiveStock({ officeId, productId, quantity: 5, employeeId });

  const order = await placeOrder({
    personId: person.personId,
    officeId,
    items: [{ productId, quantity: 2 }],
    actor: 'mini_app',
    driverIsDemo: false,
  });

  return { personId: person.personId, employeeId, officeId, productId, order };
};

describe('выдача и отмена заказа', () => {
  afterEach(async () => {
    await cleanupTestData();
    await cleanupTestEmployees();
  });
  afterAll(disconnectDatabase);

  it('выдача снимает резерв и не трогает баланс', async () => {
    const scenario = await placeScenario();
    const balanceBefore = await readAccountBalance(scenario.personId);

    const issued = await issueOrder({
      orderId: scenario.order.orderId,
      employeeId: scenario.employeeId,
    });

    expect(issued.orderId).toBe(scenario.order.orderId);

    const stored = await readOrder(scenario.order.orderId);
    expect(stored?.status).toBe('issued');
    expect(stored?.issuedByEmployeeId).toBe(scenario.employeeId);
    expect(stored?.refundTransferId).toBeNull();

    // Резерв снят, свободный остаток не вырос: товар уехал из офиса.
    expect(await readStock(scenario.officeId, scenario.productId)).toEqual({
      onHand: 3,
      reserved: 0,
    });

    // Баллы погашены при оформлении, и выдача к ним не прикасается.
    expect(await readAccountBalance(scenario.personId)).toBe(balanceBefore);
    expect(await countTransfersByReason(scenario.personId, 'order_refund')).toBe(0);

    const movements = await listStockMovements(scenario.officeId, scenario.productId);
    expect(movements.map((movement) => movement.kind)).toEqual([
      'incoming',
      'order_reserve',
      'order_issue',
    ]);
  });

  it('повторная выдача не делает второй операции', async () => {
    const scenario = await placeScenario();

    await issueOrder({
      orderId: scenario.order.orderId,
      employeeId: scenario.employeeId,
    });

    // Выданный заказ больше не висит, и под блокировку второй выдаче его не достаётся.
    await expect(
      issueOrder({
        orderId: scenario.order.orderId,
        employeeId: scenario.employeeId,
      }),
    ).rejects.toBeInstanceOf(OrderNotFoundError);

    expect(await readStock(scenario.officeId, scenario.productId)).toEqual({
      onHand: 3,
      reserved: 0,
    });
    expect(await listStockMovements(scenario.officeId, scenario.productId)).toHaveLength(3);
  });

  it('отмена возвращает и баллы, и остаток', async () => {
    const scenario = await placeScenario();

    const cancelled = await cancelOrder({ orderId: scenario.order.orderId, reason: 'driver' });

    expect(cancelled.refundedPoints).toBe(80);
    expect(await readAccountBalance(scenario.personId)).toBe(100n);
    expect(await readStock(scenario.officeId, scenario.productId)).toEqual({
      onHand: 5,
      reserved: 0,
    });

    const stored = await readOrder(scenario.order.orderId);
    expect(stored?.status).toBe('cancelled');
    expect(stored?.cancelReason).toBe('driver');
    // Отменял водитель — сотрудника в авторах нет.
    expect(stored?.cancelledByEmployeeId).toBeNull();

    const refund = await readTransfer(stored?.refundTransferId as string);
    expect(refund).toMatchObject({
      reason: 'order_refund',
      amount: 80n,
      orderId: scenario.order.orderId,
    });

    expect(await listStockMovements(scenario.officeId, scenario.productId)).toHaveLength(3);
  });

  it('повторная отмена не возвращает баллы дважды', async () => {
    const scenario = await placeScenario();

    await cancelOrder({ orderId: scenario.order.orderId, reason: 'driver' });

    await expect(
      cancelOrder({ orderId: scenario.order.orderId, reason: 'driver' }),
    ).rejects.toBeInstanceOf(OrderNotPendingError);

    // Тот самый баг старого бота: баллы возвращались столько раз, сколько нажали кнопку.
    expect(await readAccountBalance(scenario.personId)).toBe(100n);
    expect(await countTransfersByKey(buildOrderRefundIdempotencyKey(scenario.order.orderId))).toBe(
      1,
    );
    expect(await readStock(scenario.officeId, scenario.productId)).toEqual({
      onHand: 5,
      reserved: 0,
    });
  });

  it('выданный заказ отмене не подлежит', async () => {
    const scenario = await placeScenario();

    await issueOrder({
      orderId: scenario.order.orderId,
      employeeId: scenario.employeeId,
    });

    await expect(
      cancelOrder({ orderId: scenario.order.orderId, reason: 'employee', employeeId: scenario.employeeId }),
    ).rejects.toBeInstanceOf(OrderNotPendingError);

    expect(await readAccountBalance(scenario.personId)).toBe(20n);
  });

  it('отмена сотрудником называет автора, а без автора не проходит вовсе', async () => {
    const scenario = await placeScenario();

    // Причина `employee` без сотрудника отбивается до транзакции: то же правило стоит
    // проверкой в базе.
    await expect(
      cancelOrder({ orderId: scenario.order.orderId, reason: 'employee' }),
    ).rejects.toBeInstanceOf(CancelAuthorMismatchError);

    // И наоборот: у отмены водителем автора-сотрудника быть не может.
    await expect(
      cancelOrder({
        orderId: scenario.order.orderId,
        reason: 'driver',
        employeeId: scenario.employeeId,
      }),
    ).rejects.toBeInstanceOf(CancelAuthorMismatchError);

    await cancelOrder({
      orderId: scenario.order.orderId,
      reason: 'employee',
      employeeId: scenario.employeeId,
    });

    const stored = await readOrder(scenario.order.orderId);
    expect(stored?.cancelReason).toBe('employee');
    expect(stored?.cancelledByEmployeeId).toBe(scenario.employeeId);
  });
});
