import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { expireOrders } from '#server/services/orders/expireOrders';
import { issueOrder } from '#server/services/orders/issueOrder';
import { placeOrder } from '#server/services/orders/placeOrder';
import { receiveStock } from '#server/services/stock/receiveStock';
import {
  cleanupTestData,
  createTestOffice,
  createTestPerson,
  createTestProduct,
  disconnectDatabase,
  expireTestOrder,
  readAccountBalance,
  readOrder,
  readStock,
} from '../support/database';
import { cleanupTestEmployees, createTestEmployee } from '../support/employees';
import { grantPoints } from '../support/points';

/**
 * Просрочка: воркер отменяет висящие заказы с истёкшим сроком и не трогает остальные.
 *
 * Сервис зовётся напрямую, без очереди: расписание BullMQ — это `every` в одной строке,
 * а проверять надо решение «какие заказы просрочены», а не умение планировщика считать
 * пять минут.
 */
describe('просрочка заказов', () => {
  afterEach(async () => {
    await cleanupTestData();
    await cleanupTestEmployees();
  });
  afterAll(disconnectDatabase);

  it('отменяет только висящие с истёкшим сроком', async () => {
    const person = await createTestPerson({ inProgram: true });
    const { employeeId } = await createTestEmployee({ role: 'manager' });
    const officeId = await createTestOffice();
    const productId = await createTestProduct({ pricePoints: 10 });

    await grantPoints(person.personId, 100);
    await receiveStock({ officeId, productId, quantity: 10, employeeId });

    // Три заказа: просроченный, свежий и выданный с прошедшим сроком.
    const overdue = await placeOrder({
      personId: person.personId,
      officeId,
      items: [{ productId, quantity: 1 }],
      actor: 'mini_app',
    });
    const fresh = await placeOrder({
      personId: person.personId,
      officeId,
      items: [{ productId, quantity: 2 }],
      actor: 'mini_app',
    });
    const issued = await placeOrder({
      personId: person.personId,
      officeId,
      items: [{ productId, quantity: 3 }],
      actor: 'mini_app',
    });

    await issueOrder({ code: issued.code, officeId, employeeId });

    await expireTestOrder(overdue.orderId);
    // Срок выданного тоже в прошлом: просрочка обязана смотреть на статус, а не только
    // на время. Без этого она отменяла бы выданные заказы и возвращала за них баллы.
    await expireTestOrder(issued.orderId);

    const balanceBeforeExpiry = await readAccountBalance(person.personId);
    const summary = await expireOrders();

    expect(summary).toEqual({ found: 1, cancelled: 1, alreadyClosed: 0, failed: 0 });

    expect((await readOrder(overdue.orderId))?.status).toBe('cancelled');
    expect((await readOrder(overdue.orderId))?.cancelReason).toBe('expired');
    // Просрочку ставит воркер, человека за ней нет.
    expect((await readOrder(overdue.orderId))?.cancelledByEmployeeId).toBeNull();

    expect((await readOrder(fresh.orderId))?.status).toBe('pending');
    expect((await readOrder(issued.orderId))?.status).toBe('issued');

    // Вернулись баллы одного заказа: 1 × 10.
    expect(await readAccountBalance(person.personId)).toBe(balanceBeforeExpiry + 10n);

    // Остаток: из десяти штук три уехали выданным заказом, две держит свежий заказ,
    // штука просроченного вернулась в свободный остаток.
    expect(await readStock(officeId, productId)).toEqual({ onHand: 5, reserved: 2 });
  });

  it('повторный прогон ничего не делает', async () => {
    const person = await createTestPerson({ inProgram: true });
    const { employeeId } = await createTestEmployee({ role: 'manager' });
    const officeId = await createTestOffice();
    const productId = await createTestProduct({ pricePoints: 10 });

    await grantPoints(person.personId, 100);
    await receiveStock({ officeId, productId, quantity: 5, employeeId });

    const order = await placeOrder({
      personId: person.personId,
      officeId,
      items: [{ productId, quantity: 1 }],
      actor: 'mini_app',
    });

    await expireTestOrder(order.orderId);

    await expireOrders();
    const second = await expireOrders();

    // Отменённый заказ уже не висит и в выборку не попадает.
    expect(second).toEqual({ found: 0, cancelled: 0, alreadyClosed: 0, failed: 0 });
    expect(await readAccountBalance(person.personId)).toBe(100n);
  });
});
