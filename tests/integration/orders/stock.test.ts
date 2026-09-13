import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { placeOrder } from '#server/services/orders/placeOrder';
import { adjustStock } from '#server/services/stock/adjustStock';
import {
  EmptyAdjustmentError,
  InvalidStockTargetError,
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

  it('правка новым значением считает дельту от остатка в базе', async () => {
    const { employeeId } = await createTestEmployee({ role: 'manager' });
    const officeId = await createTestOffice();
    const productId = await createTestProduct({ pricePoints: 10 });

    await receiveStock({ officeId, productId, quantity: 5, employeeId });

    // Так говорит форма веба: сотрудник пересчитал полку и видит на ней шесть штук.
    // Дельту считает сервис — под той же блокировкой, в которой пишет движение.
    await adjustStock({ officeId, productId, targetOnHand: 6, employeeId, note: 'пересчёт' });

    expect(await readStock(officeId, productId)).toEqual({ onHand: 6, reserved: 0 });
    expect(await listStockMovements(officeId, productId)).toEqual([
      { kind: 'incoming', productId, deltaOnHand: 5, deltaReserved: 0, orderId: null },
      { kind: 'adjustment', productId, deltaOnHand: 1, deltaReserved: 0, orderId: null },
    ]);

    // Правка в меньшую сторону — тем же путём, и дельта уходит отрицательной.
    await adjustStock({ officeId, productId, targetOnHand: 2, employeeId, note: 'бой' });

    expect(await readStock(officeId, productId)).toEqual({ onHand: 2, reserved: 0 });

    // Ноль остаётся отказом и здесь: правка на то же число — запись в журнал, которая
    // ни на один вопрос не отвечает.
    await expect(
      adjustStock({ officeId, productId, targetOnHand: 2, employeeId, note: 'пересчёт' }),
    ).rejects.toBeInstanceOf(EmptyAdjustmentError);

    // Дробное и отрицательное значение до целочисленной колонки не доезжают.
    await expect(
      adjustStock({ officeId, productId, targetOnHand: 2.5, employeeId, note: 'пересчёт' }),
    ).rejects.toBeInstanceOf(InvalidStockTargetError);
    await expect(
      adjustStock({ officeId, productId, targetOnHand: -1, employeeId, note: 'пересчёт' }),
    ).rejects.toBeInstanceOf(InvalidStockTargetError);

    expect(await listStockMovements(officeId, productId)).toHaveLength(3);
  });

  it('правка новым значением заводит строку остатка с нуля', async () => {
    const { employeeId } = await createTestEmployee({ role: 'manager' });
    const officeId = await createTestOffice();
    const productId = await createTestProduct({ pricePoints: 10 });

    // Строки остатка нет вовсе: движений по паре не было ни одного. Остаток при этом —
    // ноль, и правка обязана считать дельту от него, а не отказать.
    expect(await readStock(officeId, productId)).toBeNull();

    await adjustStock({
      officeId,
      productId,
      targetOnHand: 4,
      employeeId,
      note: 'нашлось на полке',
    });

    expect(await readStock(officeId, productId)).toEqual({ onHand: 4, reserved: 0 });
    expect(await listStockMovements(officeId, productId)).toEqual([
      { kind: 'adjustment', productId, deltaOnHand: 4, deltaReserved: 0, orderId: null },
    ]);
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
