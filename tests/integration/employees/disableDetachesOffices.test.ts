import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { db } from '#server/db';
import { listEmployeeOffices, replaceOfficeEmployees } from '#server/repositories/offices';
import { readDriverHistory } from '#server/services/drivers/readDriverHistory';
import { setEmployeeDisabled } from '#server/services/employees/setEmployeeDisabled';
import { issueOrder } from '#server/services/orders/issueOrder';
import { placeOrder } from '#server/services/orders/placeOrder';
import { adjustPointsManually } from '#server/services/points/adjustPointsManually';
import { receiveStock } from '#server/services/stock/receiveStock';
import {
  cleanupTestData,
  createTestOffice,
  createTestPerson,
  createTestProduct,
  disconnectDatabase,
  readOrder,
} from '../support/database';
import { cleanupTestEmployees, createTestEmployee } from '../support/employees';
import { grantPoints } from '../support/points';

/**
 * Выключение учётки снимает её со всех офисов (решение Руслана 29-09-2026, issue #291).
 *
 * Своим файлом, а не в `management.test.ts`: здесь сотрудник успевает выдать заказ и поправить
 * баллы, и уборка идёт «данные, потом учётки» — заказы и правки ссылаются на сотрудника. Там
 * порядок обратный: уборка учёток снимает водительские привязки, на которые ссылаются люди.
 */

describe('выключение учётки и офисы', () => {
  const officeIds: string[] = [];

  afterEach(async () => {
    for (const officeId of officeIds.splice(0)) {
      await db.$executeRaw`DELETE FROM xb.employee_offices WHERE "office_id" = ${officeId}::uuid`;
    }

    await cleanupTestData();
    await cleanupTestEmployees();
  });

  afterAll(disconnectDatabase);

  it('выключение снимает со всех офисов, включение не возвращает, подпись под действиями остаётся', async () => {
    const owner = await createTestEmployee({ role: 'owner' });
    const manager = await createTestEmployee({ role: 'manager' });
    const actor = { employeeId: owner.employeeId, role: 'owner' as const };
    const firstOffice = await createTestOffice();
    const secondOffice = await createTestOffice();
    officeIds.push(firstOffice, secondOffice);

    await replaceOfficeEmployees(firstOffice, [manager.employeeId], db);
    await replaceOfficeEmployees(secondOffice, [manager.employeeId], db);

    // Менеджер успел поправить баллы и выдать заказ, пока работал.
    const person = await createTestPerson({ inProgram: true });
    const productId = await createTestProduct({ pricePoints: 10 });

    await grantPoints(person.personId, 50);
    await receiveStock({ officeId: firstOffice, productId, quantity: 1, employeeId: manager.employeeId });

    const adjustment = await adjustPointsManually({
      personId: person.personId,
      amount: 5,
      note: 'водитель пришёл разбираться',
      employeeId: manager.employeeId,
    });
    const order = await placeOrder({
      personId: person.personId,
      officeId: firstOffice,
      items: [{ productId, quantity: 1 }],
      actor: 'mini_app',
      driverIsDemo: false,
    });

    await issueOrder({ orderId: order.orderId, employeeId: manager.employeeId });

    expect(await setEmployeeDisabled({ actor, employeeId: manager.employeeId, disabled: true })).toBe('updated');
    expect(await listEmployeeOffices(manager.employeeId)).toEqual([]);

    expect(await setEmployeeDisabled({ actor, employeeId: manager.employeeId, disabled: false })).toBe('updated');
    expect(await listEmployeeOffices(manager.employeeId)).toEqual([]);

    // Выдача и правка остаются с его подписью: они ссылаются на учётку, а не на закрепление.
    expect((await readOrder(order.orderId))?.issuedByEmployeeId).toBe(manager.employeeId);

    const history = await readDriverHistory({ personId: person.personId, limit: 25, offset: 0 });
    const manualRow = history.operations.find((operation) => operation.transferId === adjustment.transferId);

    expect(manualRow?.actorEmployeeName).toBe('Тестовый Сотрудник');
    expect(manualRow?.actorEmployeeRole).toBe('manager');
  });
});
