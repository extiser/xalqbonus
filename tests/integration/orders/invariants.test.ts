import { readFileSync } from 'node:fs';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { cancelOrder } from '#server/services/orders/cancelOrder';
import { issueOrder } from '#server/services/orders/issueOrder';
import { placeOrder } from '#server/services/orders/placeOrder';
import { adjustStock } from '#server/services/stock/adjustStock';
import { receiveStock } from '#server/services/stock/receiveStock';
import {
  breakStockCacheForTest,
  cleanupTestData,
  createTestOffice,
  createTestPerson,
  createTestProduct,
  disconnectDatabase,
  runRawQuery,
} from '../support/database';
import { cleanupTestEmployees, createTestEmployee } from '../support/employees';
import { grantPoints } from '../support/points';

/**
 * Инварианты остатков. Запросы берутся из scripts/invariants.sql — того же файла, который
 * гоняет `make invariants`: своя копия разошлась бы с оригиналом на первой правке, и тест
 * начал бы проверять не то, что команда.
 *
 * Их три: свободный остаток сходится с журналом движения, резерв сходится с журналом,
 * и резерв равен сумме позиций висящих заказов. Первые два — то же отношение, что у баланса
 * и журнала баллов; третий проверяет смысл резерва и ловит товар, заблокированный навсегда.
 */
const INVARIANTS_PATH = new URL('../../../scripts/invariants.sql', import.meta.url);

const readStockInvariantQueries = (): string[] => {
  const source = readFileSync(INVARIANTS_PATH, 'utf8');
  const blocks = [...source.matchAll(/-- stock:begin \d+\n([\s\S]*?)\n-- stock:end/g)];

  return blocks.map((block) => block[1]!.trim());
};

describe('инварианты остатков', () => {
  const queries = readStockInvariantQueries();

  afterEach(async () => {
    await cleanupTestData();
    await cleanupTestEmployees();
  });
  afterAll(disconnectDatabase);

  it('в файле лежат ровно три запроса остатков', () => {
    // Четвёртый появляется правкой этого теста вместе с самим запросом, а не молча.
    expect(queries).toHaveLength(3);
  });

  it('после прихода, правки, оформления, выдачи и отмены все три запроса возвращают пусто', async () => {
    const person = await createTestPerson({ inProgram: true });
    const { employeeId } = await createTestEmployee({ role: 'manager' });
    const officeId = await createTestOffice();
    const firstProduct = await createTestProduct({ pricePoints: 10 });
    const secondProduct = await createTestProduct({ pricePoints: 20 });

    await grantPoints(person.personId, 200);

    await receiveStock({ officeId, productId: firstProduct, quantity: 10, employeeId });
    await receiveStock({ officeId, productId: secondProduct, quantity: 4, employeeId });
    await adjustStock({
      officeId,
      productId: firstProduct,
      delta: -1,
      employeeId,
      note: 'бой при разгрузке',
    });

    const issued = await placeOrder({
      personId: person.personId,
      officeId,
      items: [
        { productId: firstProduct, quantity: 2 },
        { productId: secondProduct, quantity: 1 },
      ],
      actor: 'mini_app',
    });
    const cancelled = await placeOrder({
      personId: person.personId,
      officeId,
      items: [{ productId: firstProduct, quantity: 3 }],
      actor: 'mini_app',
    });
    // Третий заказ остаётся висеть: резерв по нему обязан сойтись с позициями.
    await placeOrder({
      personId: person.personId,
      officeId,
      items: [{ productId: secondProduct, quantity: 2 }],
      actor: 'mini_app',
    });

    await issueOrder({ orderId: issued.orderId, employeeId });
    await cancelOrder({ orderId: cancelled.orderId, reason: 'employee', employeeId });

    for (const query of queries) {
      await expect(runRawQuery(query)).resolves.toEqual([]);
    }
  });

  it('правка остатка мимо журнала ловится первым запросом', async () => {
    // Проверка, которая не умеет падать, ничего не проверяет. Здесь кэш правится напрямую —
    // ровно то, что запрещено всем, кроме движения.
    const { employeeId } = await createTestEmployee({ role: 'manager' });
    const officeId = await createTestOffice();
    const productId = await createTestProduct({ pricePoints: 10 });

    await receiveStock({ officeId, productId, quantity: 5, employeeId });
    await breakStockCacheForTest(officeId, productId, 3);

    const [onHandInvariant, reservedInvariant] = queries;

    await expect(runRawQuery(onHandInvariant!)).resolves.not.toEqual([]);
    // Резерв при этом сходится: расхождение именно в свободном остатке.
    await expect(runRawQuery(reservedInvariant!)).resolves.toEqual([]);
  });

  it('резерв, не снятый при выдаче, ловится третьим запросом', async () => {
    const person = await createTestPerson({ inProgram: true });
    const { employeeId } = await createTestEmployee({ role: 'manager' });
    const officeId = await createTestOffice();
    const productId = await createTestProduct({ pricePoints: 10 });

    await grantPoints(person.personId, 100);
    await receiveStock({ officeId, productId, quantity: 5, employeeId });
    await placeOrder({
      personId: person.personId,
      officeId,
      items: [{ productId, quantity: 2 }],
      actor: 'mini_app',
    });

    // Так выглядел бы забытый резерв: заказ закрылся, а занятое осталось занятым. Кэш
    // и журнал при этом сходятся между собой, и первые два запроса этого не видят —
    // третий видит.
    await breakStockCacheForTest(officeId, productId, 0, 2);

    const [onHandInvariant, reservedInvariant, pendingInvariant] = queries;

    await expect(runRawQuery(pendingInvariant!)).resolves.not.toEqual([]);
    await expect(runRawQuery(onHandInvariant!)).resolves.toEqual([]);
    // Второй запрос расхождение тоже видит — резерв кэша разошёлся с журналом движения.
    await expect(runRawQuery(reservedInvariant!)).resolves.not.toEqual([]);
  });
});
