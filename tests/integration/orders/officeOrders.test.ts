import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { db } from '#server/db';
import type { EmployeeRole } from '#server/generated/prisma/enums';
import { readEmployeeOffices } from '#server/services/offices/employeeOffices';
import { OfficeNotOpenError } from '#server/services/offices/errors';
import { cancelOfficeOrder } from '#server/services/orders/cancelOfficeOrder';
import { OrderNotFoundError, OrderNotPendingError } from '#server/services/orders/errors';
import { findOfficeOrderByCode } from '#server/services/orders/findOfficeOrderByCode';
import { issueOfficeOrder } from '#server/services/orders/issueOfficeOrder';
import { placeOrder, type PlacedOrder } from '#server/services/orders/placeOrder';
import { readOfficeOrders } from '#server/services/orders/readOfficeOrders';
import { receiveStock } from '#server/services/stock/receiveStock';
import {
  cleanupTestData,
  createTestOffice,
  createTestPerson,
  createTestProduct,
  disconnectDatabase,
  listStockMovements,
  readAccountBalance,
  readOrder,
  readStock,
} from '../support/database';
import { cleanupTestEmployees, createTestEmployee } from '../support/employees';
import { grantPoints } from '../support/points';

/**
 * Выдача и отмена заказа сотрудником — поверх `issueOrder` и `cancelOrder`.
 *
 * Сами операции покрыты `issueAndCancel.test.ts`. Здесь — то, что добавляет к ним стойка:
 * в каком офисе сотрудник может работать, что видит второе нажатие «Выдать» и кто записан
 * автором отмены. Ошибка в правиле офисов отдала бы менеджеру чужие заказы, а ошибка
 * в разборе двойного нажатия — ответ «код не найден» под только что выданным заказом.
 */

type Worker = { employeeId: string; role: EmployeeRole };

type Scenario = {
  personId: string;
  officeId: string;
  productId: string;
  order: PlacedOrder;
};

/** Привязки сотрудников к офисам, заведённые тестом. Уходят первыми: на них ссылаются обе стороны. */
const linkedEmployeeIds = new Set<string>();

const createWorker = async (role: EmployeeRole, officeIds: string[] = []): Promise<Worker> => {
  const { employeeId } = await createTestEmployee({ role });

  for (const officeId of officeIds) {
    await db.$executeRaw`
      INSERT INTO xb.employee_offices ("employee_id", "office_id")
      VALUES (${employeeId}::uuid, ${officeId}::uuid)
    `;
    linkedEmployeeIds.add(employeeId);
  }

  return { employeeId, role };
};

/** Водитель с сотней баллов, офис с пятью штуками по 40 и висящий заказ на две. */
const placeScenario = async (): Promise<Scenario> => {
  const person = await createTestPerson({ inProgram: true });
  const officeId = await createTestOffice();
  const productId = await createTestProduct({ pricePoints: 40 });
  const { employeeId } = await createTestEmployee({ role: 'admin' });

  await grantPoints(person.personId, 100);
  await receiveStock({ officeId, productId, quantity: 5, employeeId });

  const order = await placeOrder({
    personId: person.personId,
    officeId,
    items: [{ productId, quantity: 2 }],
    actor: 'mini_app',
  });

  return { personId: person.personId, officeId, productId, order };
};

describe('заказы у стойки', () => {
  afterEach(async () => {
    const employeeIds = [...linkedEmployeeIds];
    linkedEmployeeIds.clear();

    if (employeeIds.length > 0) {
      await db.$executeRaw`
        DELETE FROM xb.employee_offices WHERE "employee_id" = ANY(${employeeIds}::uuid[])
      `;
    }

    await cleanupTestData();
    await cleanupTestEmployees();
  });
  afterAll(disconnectDatabase);

  it('менеджер своего офиса находит заказ по коду и выдаёт: резерв снят, баланс не тронут', async () => {
    const scenario = await placeScenario();
    const manager = await createWorker('manager', [scenario.officeId]);
    const balanceBefore = await readAccountBalance(scenario.personId);

    const found = await findOfficeOrderByCode(manager, scenario.officeId, scenario.order.code);

    expect(found.orderId).toBe(scenario.order.orderId);
    expect(found.totalPoints).toBe(80);

    const issued = await issueOfficeOrder(manager, found.orderId);

    expect(issued.status).toBe('issued');
    expect((await readOrder(scenario.order.orderId))?.issuedByEmployeeId).toBe(manager.employeeId);
    expect(await readStock(scenario.officeId, scenario.productId)).toEqual({ onHand: 3, reserved: 0 });
    expect(await readAccountBalance(scenario.personId)).toBe(balanceBefore);

    // Выданный пропал из висящих: код освободился, и по нему больше не находится ничего.
    await expect(
      findOfficeOrderByCode(manager, scenario.officeId, scenario.order.code),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
  });

  it('второе нажатие «Выдать» отвечает «уже выдан» и второй операции не делает', async () => {
    const scenario = await placeScenario();
    const manager = await createWorker('manager', [scenario.officeId]);

    // Два нажатия вровень: второе может дойти до `issueOrder` раньше, чем первое закончит.
    const results = await Promise.allSettled([
      issueOfficeOrder(manager, scenario.order.orderId),
      issueOfficeOrder(manager, scenario.order.orderId),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toBeInstanceOf(OrderNotPendingError);
    expect((rejected[0] as OrderNotPendingError).status).toBe('issued');

    // И третье, запоздалое, — тот же ответ.
    await expect(issueOfficeOrder(manager, scenario.order.orderId)).rejects.toMatchObject({
      status: 'issued',
    });

    expect(await readStock(scenario.officeId, scenario.productId)).toEqual({ onHand: 3, reserved: 0 });
    expect(await listStockMovements(scenario.officeId, scenario.productId)).toHaveLength(3);
  });

  it('отмена сотрудником возвращает баллы и остаток и записывает автора', async () => {
    const scenario = await placeScenario();
    const manager = await createWorker('manager', [scenario.officeId]);

    const cancelled = await cancelOfficeOrder(manager, scenario.order.orderId);

    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelReason).toBe('employee');
    expect(await readAccountBalance(scenario.personId)).toBe(100n);
    expect(await readStock(scenario.officeId, scenario.productId)).toEqual({ onHand: 5, reserved: 0 });
    expect((await readOrder(scenario.order.orderId))?.cancelledByEmployeeId).toBe(manager.employeeId);

    await expect(cancelOfficeOrder(manager, scenario.order.orderId)).rejects.toMatchObject({
      status: 'cancelled',
    });
    expect(await readAccountBalance(scenario.personId)).toBe(100n);
  });

  it('код заказа другого офиса менеджеру не находится, владельцу находится любой', async () => {
    const scenario = await placeScenario();
    const otherOffice = await createTestOffice();
    const manager = await createWorker('manager', [otherOffice]);
    const owner = await createWorker('owner');

    // В своём офисе чужой код — «не найден», как и несуществующий.
    await expect(
      findOfficeOrderByCode(manager, otherOffice, scenario.order.code),
    ).rejects.toBeInstanceOf(OrderNotFoundError);

    // В чужой офис менеджера не пускают вовсе — ни искать, ни выдавать, ни отменять.
    await expect(
      findOfficeOrderByCode(manager, scenario.officeId, scenario.order.code),
    ).rejects.toBeInstanceOf(OfficeNotOpenError);
    await expect(issueOfficeOrder(manager, scenario.order.orderId)).rejects.toBeInstanceOf(
      OfficeNotOpenError,
    );
    await expect(cancelOfficeOrder(manager, scenario.order.orderId)).rejects.toBeInstanceOf(
      OfficeNotOpenError,
    );
    expect((await readOrder(scenario.order.orderId))?.status).toBe('pending');

    const found = await findOfficeOrderByCode(owner, scenario.officeId, scenario.order.code);

    expect(found.orderId).toBe(scenario.order.orderId);
  });

  it('менеджеру без офисов список пуст, а ручки отказывают', async () => {
    const scenario = await placeScenario();
    const manager = await createWorker('manager');

    expect(await readEmployeeOffices(manager)).toEqual([]);

    await expect(
      readOfficeOrders(manager, { officeId: null, status: null, limit: 25, offset: 0 }),
    ).rejects.toBeInstanceOf(OfficeNotOpenError);
    await expect(
      findOfficeOrderByCode(manager, scenario.officeId, scenario.order.code),
    ).rejects.toBeInstanceOf(OfficeNotOpenError);
  });
});
