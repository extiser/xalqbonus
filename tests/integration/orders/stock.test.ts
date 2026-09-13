import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { placeOrder } from '#server/services/orders/placeOrder';
import { adjustStock } from '#server/services/stock/adjustStock';
import {
  EmptyAdjustmentError,
  MissingAdjustmentNoteError,
  StockWouldGoNegativeError,
  UnknownStockTargetError,
} from '#server/services/stock/errors';
import { receiveStock } from '#server/services/stock/receiveStock';
import {
  cleanupTestData,
  createTestOffice,
  createTestPerson,
  createTestProduct,
  disconnectDatabase,
  listStockMovements,
  readStock,
} from '../support/database';
import { cleanupTestEmployees, createTestEmployee } from '../support/employees';
import { grantPoints } from '../support/points';

/**
 * Приход и правка остатка — две операции для веба.
 *
 * Обе пишут движение и кэш одной транзакцией; прямой `UPDATE office_stock` запрещён так же,
 * как прямое изменение баланса.
 */
describe('остатки офиса', () => {
  afterEach(async () => {
    await cleanupTestData();
    await cleanupTestEmployees();
  });
  afterAll(disconnectDatabase);

  it('приход заводит строку остатка первым движением', async () => {
    const { employeeId } = await createTestEmployee({ role: 'manager' });
    const officeId = await createTestOffice();
    const productId = await createTestProduct({ pricePoints: 10 });

    expect(await readStock(officeId, productId)).toBeNull();

    await receiveStock({ officeId, productId, quantity: 7, employeeId, note: 'первая поставка' });

    expect(await readStock(officeId, productId)).toEqual({ onHand: 7, reserved: 0 });
    expect(await listStockMovements(officeId, productId)).toEqual([
      { kind: 'incoming', productId, deltaOnHand: 7, deltaReserved: 0, orderId: null },
    ]);
  });

  it('правка меняет остаток в обе стороны и требует заметки', async () => {
    const { employeeId } = await createTestEmployee({ role: 'manager' });
    const officeId = await createTestOffice();
    const productId = await createTestProduct({ pricePoints: 10 });

    await receiveStock({ officeId, productId, quantity: 5, employeeId });

    await adjustStock({ officeId, productId, delta: -2, employeeId, note: 'бой' });
    await adjustStock({ officeId, productId, delta: 1, employeeId, note: 'нашлось при пересчёте' });

    expect(await readStock(officeId, productId)).toEqual({ onHand: 4, reserved: 0 });

    await expect(
      adjustStock({ officeId, productId, delta: 1, employeeId, note: '   ' }),
    ).rejects.toBeInstanceOf(MissingAdjustmentNoteError);

    await expect(
      adjustStock({ officeId, productId, delta: 0, employeeId, note: 'ничего' }),
    ).rejects.toBeInstanceOf(EmptyAdjustmentError);

    expect(await readStock(officeId, productId)).toEqual({ onHand: 4, reserved: 0 });
  });

  it('правка не уводит остаток в минус и не трогает резерв', async () => {
    const person = await createTestPerson({ inProgram: true });
    const { employeeId } = await createTestEmployee({ role: 'manager' });
    const officeId = await createTestOffice();
    const productId = await createTestProduct({ pricePoints: 10 });

    await grantPoints(person.personId, 100);
    await receiveStock({ officeId, productId, quantity: 5, employeeId });
    await placeOrder({
      personId: person.personId,
      officeId,
      items: [{ productId, quantity: 3 }],
      actor: 'mini_app',
    });

    // Свободного остатка два: три штуки держит висящий заказ. Списать можно только
    // свободное — резерв принадлежит водителю, который за него уже заплатил баллами.
    await expect(
      adjustStock({ officeId, productId, delta: -3, employeeId, note: 'недостача' }),
    ).rejects.toBeInstanceOf(StockWouldGoNegativeError);

    expect(await readStock(officeId, productId)).toEqual({ onHand: 2, reserved: 3 });
    // Отбитая правка не оставила за собой движения: транзакция откатилась целиком.
    expect(await listStockMovements(officeId, productId)).toHaveLength(2);
  });

  it('приход на несуществующий товар — доменная ошибка, а не отказ базы', async () => {
    const { employeeId } = await createTestEmployee({ role: 'manager' });
    const officeId = await createTestOffice();

    await expect(
      receiveStock({
        officeId,
        productId: '00000000-0000-0000-0000-000000000000',
        quantity: 1,
        employeeId,
      }),
    ).rejects.toBeInstanceOf(UnknownStockTargetError);
  });
});
