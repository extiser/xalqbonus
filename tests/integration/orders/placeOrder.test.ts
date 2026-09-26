import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { InsufficientPointsError } from '#server/services/points/errors';
import {
  buildOrderSpendIdempotencyKey,
} from '#server/services/points/idempotencyKey';
import {
  InsufficientStockError,
  OfficeUnavailableError,
  ProductUnavailableError,
} from '#server/services/orders/errors';
import { placeOrder } from '#server/services/orders/placeOrder';
import { receiveStock } from '#server/services/stock/receiveStock';
import {
  cleanupTestData,
  countOrdersByPerson,
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
  readSystemBalance,
  readTransfer,
} from '../support/database';
import { cleanupTestEmployees, createTestEmployee } from '../support/employees';
import { grantPoints } from '../support/points';

/**
 * Оформление заказа — одна транзакция на списание баллов и резерв остатка.
 *
 * Правило «тесты пишутся только на ядро начисления баллов» этим не нарушается, а
 * применяется: оформление и отмена — операции с журналом, и ядро отвечает за них так же,
 * как за начисление (docs/decisions.md → «Каталог: заказ — это касса, остаток живёт
 * по офисам»).
 *
 * Уборка идёт в два шага и в этом порядке: `cleanupTestData` уносит движения остатка
 * и заказы, и только после этого можно убрать сотрудников — ссылки на сотрудника стоят
 * на `SET NULL`, а движение `adjustment` без автора нарушает проверку знаков.
 */
describe('оформление заказа', () => {
  afterEach(async () => {
    await cleanupTestData();
    await cleanupTestEmployees();
  });
  afterAll(disconnectDatabase);

  it('списывает баллы и резервирует остаток одной транзакцией', async () => {
    const person = await createTestPerson({ inProgram: true });
    const { employeeId } = await createTestEmployee({ role: 'manager' });
    const officeId = await createTestOffice();
    const productId = await createTestProduct({ pricePoints: 40 });

    await grantPoints(person.personId, 100);
    await receiveStock({ officeId, productId, quantity: 5, employeeId });

    const redemptionBefore = await readSystemBalance('redemption');

    const order = await placeOrder({
      personId: person.personId,
      officeId,
      items: [{ productId, quantity: 2 }],
      actor: 'mini_app',
      driverIsDemo: false,
    });

    expect(order.totalPoints).toBe(80);
    expect(order.code).toMatch(/^\d{5}$/);
    // Номер сквозной и выдаётся базой: он для людей, а не для ключей.
    expect(order.number).toBeGreaterThan(0);
    // Срок — сутки вперёд; сравнение грубое, потому что время ставит база.
    expect(order.expiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1_000);

    expect(await readAccountBalance(person.personId)).toBe(20n);
    expect(await readSystemBalance('redemption')).toBe(redemptionBefore + 80n);

    // Остаток ушёл из свободного в резерв, а не просто уменьшился: товар ещё в офисе.
    expect(await readStock(officeId, productId)).toEqual({ onHand: 3, reserved: 2 });

    const movements = await listStockMovements(officeId, productId);
    expect(movements).toEqual([
      { kind: 'incoming', productId, deltaOnHand: 5, deltaReserved: 0, orderId: null },
      {
        kind: 'order_reserve',
        productId,
        deltaOnHand: -2,
        deltaReserved: 2,
        orderId: order.orderId,
      },
    ]);

    const stored = await readOrder(order.orderId);
    expect(stored?.status).toBe('pending');
    expect(stored?.totalPoints).toBe(80);
    expect(stored?.refundTransferId).toBeNull();

    // Перевод списания помнит заказ своей контекстной колонкой, а заказ — перевод.
    const transfer = await readTransfer(stored?.spendTransferId as string);
    expect(transfer).toMatchObject({ reason: 'order_spend', amount: 80n, orderId: order.orderId });
    expect(await countTransfersByKey(buildOrderSpendIdempotencyKey(order.orderId))).toBe(1);
  });

  it('позиция помнит цену на момент заказа, а не текущую', async () => {
    const person = await createTestPerson({ inProgram: true });
    const { employeeId } = await createTestEmployee({ role: 'manager' });
    const officeId = await createTestOffice();
    const first = await createTestProduct({ pricePoints: 10 });
    const second = await createTestProduct({ pricePoints: 25 });

    await grantPoints(person.personId, 100);
    await receiveStock({ officeId, productId: first, quantity: 3, employeeId });
    await receiveStock({ officeId, productId: second, quantity: 3, employeeId });

    const order = await placeOrder({
      personId: person.personId,
      officeId,
      items: [
        { productId: first, quantity: 2 },
        { productId: second, quantity: 1 },
      ],
      actor: 'mini_app',
      driverIsDemo: false,
    });

    // 2 × 10 + 1 × 25.
    expect(order.totalPoints).toBe(45);
    expect(await readAccountBalance(person.personId)).toBe(55n);
  });

  it('не хватает баллов — ни заказа, ни движения остатка', async () => {
    const person = await createTestPerson({ inProgram: true });
    const { employeeId } = await createTestEmployee({ role: 'manager' });
    const officeId = await createTestOffice();
    const productId = await createTestProduct({ pricePoints: 40 });

    await grantPoints(person.personId, 30);
    await receiveStock({ officeId, productId, quantity: 5, employeeId });

    await expect(
      placeOrder({
        personId: person.personId,
        officeId,
        items: [{ productId, quantity: 1 }],
        actor: 'mini_app',
        driverIsDemo: false,
      }),
    ).rejects.toBeInstanceOf(InsufficientPointsError);

    // Откатилось всё: и заказ, и резерв. Остаток — ровно тот, что пришёл приходом.
    expect(await countOrdersByPerson(person.personId)).toBe(0);
    expect(await readAccountBalance(person.personId)).toBe(30n);
    expect(await readStock(officeId, productId)).toEqual({ onHand: 5, reserved: 0 });
    expect(await listStockMovements(officeId, productId)).toHaveLength(1);
  });

  it('не хватает остатка — ни заказа, ни перевода', async () => {
    const person = await createTestPerson({ inProgram: true });
    const { employeeId } = await createTestEmployee({ role: 'manager' });
    const officeId = await createTestOffice();
    const productId = await createTestProduct({ pricePoints: 10 });

    await grantPoints(person.personId, 100);
    await receiveStock({ officeId, productId, quantity: 1, employeeId });

    await expect(
      placeOrder({
        personId: person.personId,
        officeId,
        items: [{ productId, quantity: 2 }],
        actor: 'mini_app',
        driverIsDemo: false,
      }),
    ).rejects.toBeInstanceOf(InsufficientStockError);

    expect(await countOrdersByPerson(person.personId)).toBe(0);
    expect(await readAccountBalance(person.personId)).toBe(100n);
    expect(await countTransfersByReason(person.personId, 'order_spend')).toBe(0);
    expect(await readStock(officeId, productId)).toEqual({ onHand: 1, reserved: 0 });
  });

  it('товара, которого в этом офисе не было ни разу, заказать нельзя', async () => {
    const person = await createTestPerson({ inProgram: true });
    const officeId = await createTestOffice();
    const productId = await createTestProduct({ pricePoints: 10 });

    await grantPoints(person.personId, 100);

    // Строки остатка нет вовсе — это ноль, а не отсутствие проверки.
    await expect(
      placeOrder({
        personId: person.personId,
        officeId,
        items: [{ productId, quantity: 1 }],
        actor: 'mini_app',
        driverIsDemo: false,
      }),
    ).rejects.toBeInstanceOf(InsufficientStockError);

    expect(await countOrdersByPerson(person.personId)).toBe(0);
    expect(await readStock(officeId, productId)).toBeNull();
  });

  it('архивный офис и архивный товар заказ не принимают', async () => {
    const person = await createTestPerson({ inProgram: true });
    const { employeeId } = await createTestEmployee({ role: 'manager' });
    const archivedOffice = await createTestOffice({ archived: true });
    const workingOffice = await createTestOffice();
    const archivedProduct = await createTestProduct({ pricePoints: 10, archived: true });

    await grantPoints(person.personId, 100);
    await receiveStock({ officeId: archivedOffice, productId: archivedProduct, quantity: 5, employeeId });
    await receiveStock({ officeId: workingOffice, productId: archivedProduct, quantity: 5, employeeId });

    await expect(
      placeOrder({
        personId: person.personId,
        officeId: archivedOffice,
        items: [{ productId: archivedProduct, quantity: 1 }],
        actor: 'mini_app',
        driverIsDemo: false,
      }),
    ).rejects.toBeInstanceOf(OfficeUnavailableError);

    await expect(
      placeOrder({
        personId: person.personId,
        officeId: workingOffice,
        items: [{ productId: archivedProduct, quantity: 1 }],
        actor: 'mini_app',
        driverIsDemo: false,
      }),
    ).rejects.toBeInstanceOf(ProductUnavailableError);

    expect(await countOrdersByPerson(person.personId)).toBe(0);
    expect(await readAccountBalance(person.personId)).toBe(100n);
  });
});
