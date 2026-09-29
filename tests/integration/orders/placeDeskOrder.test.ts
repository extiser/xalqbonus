import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { db } from '#server/db';
import type { EmployeeRole, OrderPayment } from '#server/generated/prisma/enums';
import { OfficeNotOpenError } from '#server/services/offices/errors';
import {
  DriverFiredError,
  DriverWithoutAccountError,
  InsufficientStockError,
  ProductNotForRetailError,
} from '#server/services/orders/errors';
import type { OrderItemRequest } from '#server/services/orders/orderItems';
import { placeDeskOrder } from '#server/services/orders/placeDeskOrder';
import { placeOrder } from '#server/services/orders/placeOrder';
import { readMemberOrders } from '#server/services/orders/readMemberOrders';
import { InsufficientPointsError } from '#server/services/points/errors';
import { buildOrderSpendIdempotencyKey } from '#server/services/points/idempotencyKey';
import { receiveStock } from '#server/services/stock/receiveStock';
import {
  cleanupTestData,
  countOrdersByPerson,
  countTransfersByKey,
  createTestOffice,
  createTestPerson,
  createTestProduct,
  disconnectDatabase,
  fireTestPerson,
  listOrderItemSnapshots,
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
 * Заказ у стойки: сотрудник оформляет за водителя, за баллы или за розницу, и заказ сразу
 * выдан (issue #294).
 *
 * Правило «тесты только на ядро баллов» применяется, а не нарушается: оформление за баллы —
 * операция с журналом баллов, и обе оплаты — операции с журналом остатков
 * (docs/decisions.md → «Каталог: заказ — это касса, остаток живёт по офисам»).
 *
 * Отдельно проверяется то, чего база не держит сама: цена позиции в валюте способа оплаты
 * заказа. Проверка строки позиции до заказа не достаёт — это другая таблица, — и согласие
 * держит единственный путь вставки. Тест здесь и есть его сторож.
 */

type Worker = { employeeId: string; role: EmployeeRole; isDemo: boolean };

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

  return { employeeId, role, isDemo: false };
};

type Scenario = {
  personId: string;
  officeId: string;
  productId: string;
  manager: Worker;
};

/**
 * Офис с пятью штуками товара по 40 баллов и 35 000 сумов, менеджер этого офиса и водитель.
 * `points` — сколько баллов у водителя; пусто — счёта у него нет вовсе.
 */
const deskScenario = async ({
  points,
  inProgram = true,
  priceRetail = 35_000,
}: {
  points: number | null;
  inProgram?: boolean;
  priceRetail?: number;
}): Promise<Scenario> => {
  const person = await createTestPerson({ inProgram });
  const officeId = await createTestOffice();
  const productId = await createTestProduct({ pricePoints: 40, priceRetail });
  const manager = await createWorker('manager', [officeId]);

  if (points !== null) {
    await grantPoints(person.personId, points);
  }

  await receiveStock({ officeId, productId, quantity: 5, employeeId: manager.employeeId });

  return { personId: person.personId, officeId, productId, manager };
};

const placeAtDesk = (
  scenario: Scenario,
  payment: OrderPayment,
  items: OrderItemRequest[] = [{ productId: scenario.productId, quantity: 2 }],
  worker: Worker = scenario.manager,
) =>
  placeDeskOrder(worker, {
    officeId: scenario.officeId,
    personId: scenario.personId,
    payment,
    items,
    actor: 'web',
  });

describe('заказ у стойки', () => {
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

  it('за баллы: списание ровно на цену, товар ушёл из офиса, резерв не тронут, заказ выдан', async () => {
    const scenario = await deskScenario({ points: 100 });

    // Висящий заказ из бота держит резерв: оформление у стойки обязано оставить его ровно таким же.
    const other = await createTestPerson({ inProgram: true });
    await grantPoints(other.personId, 100);
    await placeOrder({
      personId: other.personId,
      officeId: scenario.officeId,
      items: [{ productId: scenario.productId, quantity: 1 }],
      actor: 'mini_app',
      driverIsDemo: false,
    });

    expect(await readStock(scenario.officeId, scenario.productId)).toEqual({ onHand: 4, reserved: 1 });

    const redemptionBefore = await readSystemBalance('redemption');
    const placed = await placeAtDesk(scenario, 'points');

    expect(placed).toMatchObject({ payment: 'points', totalPoints: 80, totalRetail: null });
    expect(await readAccountBalance(scenario.personId)).toBe(20n);
    expect(await readSystemBalance('redemption')).toBe(redemptionBefore + 80n);
    expect(await readStock(scenario.officeId, scenario.productId)).toEqual({ onHand: 2, reserved: 1 });

    const stored = await readOrder(placed.orderId);

    expect(stored).toMatchObject({
      status: 'issued',
      payment: 'points',
      channel: 'desk',
      code: null,
      expiresAt: null,
      totalPoints: 80,
      totalRetail: null,
      createdByEmployeeId: scenario.manager.employeeId,
      issuedByEmployeeId: scenario.manager.employeeId,
    });
    expect(stored?.issuedAt).not.toBeNull();

    // Перевод тот же, что у заказа из бота: списание с ключом `order_spend:<orders.id>`, —
    // но подписан сотрудником: списал он, а не водитель.
    const transfer = await readTransfer(stored?.spendTransferId as string);
    expect(transfer).toMatchObject({
      reason: 'order_spend',
      amount: 80n,
      orderId: placed.orderId,
      actorEmployeeId: scenario.manager.employeeId,
    });
    expect(await countTransfersByKey(buildOrderSpendIdempotencyKey(placed.orderId))).toBe(1);

    expect(await listOrderItemSnapshots(placed.orderId)).toEqual([
      { productId: scenario.productId, quantity: 2, unitPoints: 40, unitRetail: null },
    ]);

    // Два движения, резерв и выдача, — как у заказа бота, только разом и от сотрудника.
    const movements = (await listStockMovements(scenario.officeId, scenario.productId)).filter(
      (movement) => movement.orderId === placed.orderId,
    );
    expect(movements).toEqual([
      { kind: 'order_reserve', productId: scenario.productId, deltaOnHand: -2, deltaReserved: 2, orderId: placed.orderId },
      { kind: 'order_issue', productId: scenario.productId, deltaOnHand: 0, deltaReserved: -2, orderId: placed.orderId },
    ]);
  });

  it('за розницу: перевода нет, сумма по розничной цене, водитель вне программы и без счёта', async () => {
    const scenario = await deskScenario({ points: null, inProgram: false });
    const redemptionBefore = await readSystemBalance('redemption');

    const placed = await placeAtDesk(scenario, 'retail', [{ productId: scenario.productId, quantity: 3 }]);

    expect(placed).toMatchObject({ payment: 'retail', totalPoints: null, totalRetail: 105_000 });

    const stored = await readOrder(placed.orderId);

    expect(stored).toMatchObject({
      status: 'issued',
      payment: 'retail',
      channel: 'desk',
      totalPoints: null,
      totalRetail: 105_000,
      spendTransferId: null,
      createdByEmployeeId: scenario.manager.employeeId,
    });
    expect(await countTransfersByKey(buildOrderSpendIdempotencyKey(placed.orderId))).toBe(0);
    expect(await readSystemBalance('redemption')).toBe(redemptionBefore);

    expect(await listOrderItemSnapshots(placed.orderId)).toEqual([
      { productId: scenario.productId, quantity: 3, unitPoints: null, unitRetail: 35_000 },
    ]);
    expect(await readStock(scenario.officeId, scenario.productId)).toEqual({ onHand: 2, reserved: 0 });
  });

  it('за розницу у водителя с баллами баланс не трогается', async () => {
    const scenario = await deskScenario({ points: 100 });

    await placeAtDesk(scenario, 'retail');

    expect(await readAccountBalance(scenario.personId)).toBe(100n);
  });

  it('водитель видит в Mini App заказ стойки за баллы и не видит розничного', async () => {
    const scenario = await deskScenario({ points: 100 });

    const points = await placeAtDesk(scenario, 'points', [{ productId: scenario.productId, quantity: 1 }]);
    await placeAtDesk(scenario, 'retail', [{ productId: scenario.productId, quantity: 1 }]);

    const { orders } = await readMemberOrders({ personId: scenario.personId, language: 'ru' });

    expect(orders.map((order) => order.orderId)).toEqual([points.orderId]);
    expect(orders[0]).toMatchObject({ status: 'issued', code: null, totalPoints: 40 });
  });

  describe('отказы — без заказа, без списания и без движения остатка', () => {
    /** После отказа не осталось ничего: ни заказа, ни движения, ни списания. */
    const expectNothingWritten = async (scenario: Scenario, balance: bigint | null): Promise<void> => {
      expect(await countOrdersByPerson(scenario.personId)).toBe(0);
      expect(await readStock(scenario.officeId, scenario.productId)).toEqual({ onHand: 5, reserved: 0 });

      if (balance !== null) {
        expect(await readAccountBalance(scenario.personId)).toBe(balance);
      }
    };

    it('уволенному — ни за баллы, ни за розницу', async () => {
      const scenario = await deskScenario({ points: 100 });
      await fireTestPerson(scenario.personId);

      await expect(placeAtDesk(scenario, 'points')).rejects.toBeInstanceOf(DriverFiredError);
      await expect(placeAtDesk(scenario, 'retail')).rejects.toBeInstanceOf(DriverFiredError);
      await expectNothingWritten(scenario, 100n);
    });

    it('без счёта — за баллы нельзя, и счёт ради отказа не заводится', async () => {
      const scenario = await deskScenario({ points: null });

      await expect(placeAtDesk(scenario, 'points')).rejects.toBeInstanceOf(DriverWithoutAccountError);
      await expectNothingWritten(scenario, null);

      const accounts = await db.$queryRaw<{ total: number }[]>`
        SELECT count(*)::int AS "total" FROM xb.accounts WHERE "person_id" = ${scenario.personId}::uuid
      `;
      expect(accounts[0]?.total).toBe(0);
    });

    it('без розничной цены — за розницу нельзя, за баллы можно', async () => {
      const scenario = await deskScenario({ points: 100, priceRetail: 0 });

      await expect(placeAtDesk(scenario, 'retail')).rejects.toBeInstanceOf(ProductNotForRetailError);
      await expectNothingWritten(scenario, 100n);

      await expect(placeAtDesk(scenario, 'points')).resolves.toMatchObject({ totalPoints: 80 });
    });

    it('не хватает остатка', async () => {
      const scenario = await deskScenario({ points: 1_000 });

      await expect(
        placeAtDesk(scenario, 'points', [{ productId: scenario.productId, quantity: 6 }]),
      ).rejects.toBeInstanceOf(InsufficientStockError);
      await expect(
        placeAtDesk(scenario, 'retail', [{ productId: scenario.productId, quantity: 6 }]),
      ).rejects.toBeInstanceOf(InsufficientStockError);
      await expectNothingWritten(scenario, 1_000n);
    });

    it('не хватает баллов — откатываются и движения остатка', async () => {
      const scenario = await deskScenario({ points: 30 });

      await expect(placeAtDesk(scenario, 'points')).rejects.toBeInstanceOf(InsufficientPointsError);
      await expectNothingWritten(scenario, 30n);
    });

    it('менеджеру — только его офис', async () => {
      const scenario = await deskScenario({ points: 100 });
      const stranger = await createWorker('manager', [await createTestOffice()]);

      await expect(
        placeAtDesk(scenario, 'points', undefined, stranger),
      ).rejects.toBeInstanceOf(OfficeNotOpenError);
      await expect(
        placeAtDesk(scenario, 'retail', undefined, stranger),
      ).rejects.toBeInstanceOf(OfficeNotOpenError);
      await expectNothingWritten(scenario, 100n);
    });
  });
});
