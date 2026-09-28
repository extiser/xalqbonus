import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { readLegacyDebts } from '#server/repositories/legacyDriverMap';
import { importBalances } from '#server/services/legacyImport/importBalances';
import type { LegacyMatch } from '#server/services/legacyImport/matchLegacyDrivers';
import { InsufficientPointsError, NegativeBalanceNotAllowedError } from '#server/services/points/errors';
import { adjustPointsManually } from '#server/services/points/adjustPointsManually';
import { awardTripPoints } from '#server/services/points/awardTripPoints';
import { ensureDriverAccount } from '#server/services/points/ensureDriverAccount';
import { getSystemAccount } from '#server/services/points/getSystemAccount';
import {
  buildManualIdempotencyKey,
  buildOpeningIdempotencyKey,
  buildOrderSpendIdempotencyKey,
} from '#server/services/points/idempotencyKey';
import { transferPoints } from '#server/services/points/transfer';
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
  createTestTrip,
  disconnectDatabase,
  markPersonAsLegacy,
  readAccountBalance,
  readSystemBalance,
  readTransferByKey,
} from '../support/database';
import { cleanupTestEmployees, createTestEmployee } from '../support/employees';
import { disconnectQueues } from '../support/queues';

/**
 * Долг из старой базы переносится долгом (issue #276).
 *
 * Минус на водительском счёте разрешён ровно одной операции — `opening` переноса. Всё
 * остальное живёт как раньше: поездка уменьшает долг, а заказ и ручное списание углубить
 * его не могут — у них остатка не хватает, как не хватало бы при нуле.
 */

const OCCURRED_AT = new Date('2026-09-28T06:00:00.000Z');

/** Номера записей старой базы — отрицательные: настоящим записям они не мешают. */
let lastLegacyDriverId = -900_000;

/** Запись старой базы после сопоставления: шаг балансов читает из неё человека и итог. */
const legacyMatch = (personId: string, points: number): LegacyMatch => {
  lastLegacyDriverId -= 1;

  return {
    row: {
      legacyDriverId: lastLegacyDriverId,
      profileId: `test-profile-${personId}`,
      points,
      chatId: null,
      language: 'ru',
      createdAt: OCCURRED_AT,
    },
    profileId: `test-profile-${personId}`,
    personId,
    matchMethod: 'profile_id',
    mergedIntoLegacyDriverId: null,
    telegramStatus: 'skipped',
    chatId: null,
    points,
  };
};

describe('долг из старой базы', () => {
  afterEach(async () => {
    await cleanupTestData();
    await cleanupTestEmployees();
  });
  afterAll(async () => {
    await disconnectDatabase();
    await disconnectQueues();
  });

  it('отрицательный итог ложится долгом одной операцией opening', async () => {
    const person = await createTestPerson({ inProgram: true });
    const emissionBefore = await readSystemBalance('emission');

    const summary = await importBalances([legacyMatch(person.personId, -1_844)], OCCURRED_AT);

    expect(summary.transfersApplied).toBe(1);
    expect(summary.personsWithDebt).toBe(1);
    expect(summary.pointsTransferred).toBe(-1_844);
    expect(await readAccountBalance(person.personId)).toBe(-1_844n);
    // Баллы вернулись в эмиссию: журнал двусторонний, и долг — это перевод, а не вычет.
    expect(await readSystemBalance('emission')).toBe(emissionBefore + 1_844n);

    const openingKey = buildOpeningIdempotencyKey(person.personId);
    const driverAccount = await ensureDriverAccount(person.personId);
    const transfer = await readTransferByKey(openingKey);

    expect(await countTransfersByKey(openingKey)).toBe(1);
    expect(transfer?.reason).toBe('opening');
    expect(transfer?.amount).toBe(1_844n);
    expect(transfer?.fromAccountId).toBe(driverAccount.id);

    // Отчёт переноса читает долги по журналу и карте переноса, а не по счётчикам прогона.
    await markPersonAsLegacy(person.personId);
    const debt = (await readLegacyDebts()).find((entry) => entry.personId === person.personId);

    expect(debt?.points).toBe(-1_844);
    expect(debt?.legacyDriverIds).toHaveLength(1);
  });

  it('повторный перенос ничего не меняет', async () => {
    const person = await createTestPerson({ inProgram: true });
    const matches = [legacyMatch(person.personId, -213)];

    await importBalances(matches, OCCURRED_AT);
    const emissionAfterFirst = await readSystemBalance('emission');

    const repeat = await importBalances(matches, OCCURRED_AT);

    expect(repeat.transfersApplied).toBe(0);
    expect(repeat.transfersAlreadyApplied).toBe(1);
    expect(await countTransfersByKey(buildOpeningIdempotencyKey(person.personId))).toBe(1);
    expect(await readAccountBalance(person.personId)).toBe(-213n);
    expect(await readSystemBalance('emission')).toBe(emissionAfterFirst);
  });

  it('у склеенной пары знак решает сумма половин', async () => {
    const debtor = await createTestPerson({ inProgram: true });
    const creditor = await createTestPerson({ inProgram: true });

    await importBalances(
      [
        legacyMatch(debtor.personId, 100),
        legacyMatch(debtor.personId, -150),
        legacyMatch(creditor.personId, -40),
        legacyMatch(creditor.personId, 70),
      ],
      OCCURRED_AT,
    );

    expect(await readAccountBalance(debtor.personId)).toBe(-50n);
    expect(await readAccountBalance(creditor.personId)).toBe(30n);
  });

  it('признак обхода остатка с причиной не opening — ошибка, ничего не записано', async () => {
    const person = await createTestPerson({ inProgram: true });
    const driverAccount = await ensureDriverAccount(person.personId);
    const emissionAccount = await getSystemAccount('emission');
    const idempotencyKey = buildManualIdempotencyKey(randomUUID());

    await expect(
      transferPoints({
        reason: 'manual',
        idempotencyKey,
        amount: 5,
        fromAccountId: driverAccount.id,
        toAccountId: emissionAccount.id,
        occurredAt: OCCURRED_AT,
        allowNegative: true,
      }),
    ).rejects.toBeInstanceOf(NegativeBalanceNotAllowedError);

    expect(await countTransfersByKey(idempotencyKey)).toBe(0);
    expect(await readAccountBalance(person.personId)).toBe(0n);
  });

  it('поездка уменьшает долг на балл', async () => {
    const person = await createTestPerson({ inProgram: true });
    await importBalances([legacyMatch(person.personId, -10)], OCCURRED_AT);

    const tripOrderId = `test-trip-${person.personId}-0`;
    await createTestTrip({
      profileId: person.profileId,
      tripOrderId,
      status: 'complete',
      endedAt: new Date('2026-09-28T09:00:00.000Z'),
    });

    const summary = await awardTripPoints([tripOrderId]);

    expect(summary.awarded).toBe(1);
    expect(await readAccountBalance(person.personId)).toBe(-9n);
  });

  it('заказ при долге — InsufficientPointsError, долг не углубляется', async () => {
    const person = await createTestPerson({ inProgram: true });
    const { employeeId } = await createTestEmployee({ role: 'manager' });
    const officeId = await createTestOffice();
    const productId = await createTestProduct({ pricePoints: 1 });

    await importBalances([legacyMatch(person.personId, -10)], OCCURRED_AT);
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

    expect(await readAccountBalance(person.personId)).toBe(-10n);
    expect(await countOrdersByPerson(person.personId)).toBe(0);
  });

  it('ручное списание при долге — InsufficientPointsError, долг не углубляется', async () => {
    const person = await createTestPerson({ inProgram: true });
    const { employeeId } = await createTestEmployee({ role: 'owner' });

    await importBalances([legacyMatch(person.personId, -10)], OCCURRED_AT);

    await expect(
      adjustPointsManually({ personId: person.personId, amount: -1, note: 'списание при долге', employeeId }),
    ).rejects.toBeInstanceOf(InsufficientPointsError);

    expect(await readAccountBalance(person.personId)).toBe(-10n);
    expect(await countTransfersByReason(person.personId, 'manual')).toBe(0);
  });

  it('списание, которому хватает до нуля, но не хватает с учётом долга, — тоже отказ', async () => {
    // Долг -10, поездками и правкой отработано 12: на счету 2. Списание 3 увело бы в минус
    // заново, и это уже не долг переноса, а новый — его не бывает.
    const person = await createTestPerson({ inProgram: true });
    const { employeeId } = await createTestEmployee({ role: 'owner' });
    const driverAccount = await ensureDriverAccount(person.personId);
    const redemptionAccount = await getSystemAccount('redemption');

    await importBalances([legacyMatch(person.personId, -10)], OCCURRED_AT);
    await adjustPointsManually({ personId: person.personId, amount: 12, note: 'отработал', employeeId });

    expect(await readAccountBalance(person.personId)).toBe(2n);

    await expect(
      transferPoints({
        reason: 'order_spend',
        idempotencyKey: buildOrderSpendIdempotencyKey(randomUUID()),
        amount: 3,
        fromAccountId: driverAccount.id,
        toAccountId: redemptionAccount.id,
        occurredAt: OCCURRED_AT,
      }),
    ).rejects.toBeInstanceOf(InsufficientPointsError);

    expect(await readAccountBalance(person.personId)).toBe(2n);
  });
});
