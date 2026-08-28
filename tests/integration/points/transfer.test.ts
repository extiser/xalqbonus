import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  IdempotencyKeyConflictError,
  InsufficientPointsError,
  InvalidTransferAmountError,
  SameAccountTransferError,
  UnknownAccountError,
} from '#server/services/points/errors';
import { ensureDriverAccount } from '#server/services/points/ensureDriverAccount';
import { getSystemAccount } from '#server/services/points/getSystemAccount';
import {
  buildManualIdempotencyKey,
  buildOrderRefundIdempotencyKey,
  buildOrderSpendIdempotencyKey,
  buildTripIdempotencyKey,
} from '#server/services/points/idempotencyKey';
import { transferPoints } from '#server/services/points/transfer';
import {
  cleanupTestData,
  countTransfersByKey,
  createTestPerson,
  disconnectDatabase,
  readAccountBalance,
  readSystemBalance,
} from '../support/database';

describe('примитив перевода', () => {
  let emissionAccountId = '';
  let redemptionAccountId = '';

  beforeAll(async () => {
    emissionAccountId = (await getSystemAccount('emission')).id;
    redemptionAccountId = (await getSystemAccount('redemption')).id;
  });

  afterEach(cleanupTestData);
  afterAll(disconnectDatabase);

  it('повторная вставка с тем же ключом не создаёт вторую запись и не меняет баланс', async () => {
    const person = await createTestPerson({ inProgram: true });
    const driverAccount = await ensureDriverAccount(person.personId);
    const idempotencyKey = buildTripIdempotencyKey(`test-order-${person.personId}`);
    const emissionBefore = await readSystemBalance('emission');

    const first = await transferPoints({
      reason: 'trip',
      idempotencyKey,
      amount: 1,
      fromAccountId: emissionAccountId,
      toAccountId: driverAccount.id,
      occurredAt: new Date('2026-08-20T12:00:00.000Z'),
    });

    const second = await transferPoints({
      reason: 'trip',
      idempotencyKey,
      amount: 1,
      fromAccountId: emissionAccountId,
      toAccountId: driverAccount.id,
      occurredAt: new Date('2026-08-20T12:00:00.000Z'),
    });

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    // Второй вызов вернул тот же перевод, а не завёл новый.
    expect(second.transfer.id).toBe(first.transfer.id);
    expect(await countTransfersByKey(idempotencyKey)).toBe(1);
    expect(await readAccountBalance(person.personId)).toBe(1n);
    expect(await readSystemBalance('emission')).toBe(emissionBefore - 1n);
  });

  it('повторная отмена заказа возвращает баллы один раз', async () => {
    // Каталога товаров ещё нет, поэтому возврат проверяется на самом примитиве: списание
    // и возврат — обычные переводы, отличающиеся причиной, ключом и парой счетов.
    const person = await createTestPerson({ inProgram: true });
    const driverAccount = await ensureDriverAccount(person.personId);
    const legacyOrderId = 424242;
    const occurredAt = new Date('2026-08-21T09:00:00.000Z');

    await transferPoints({
      reason: 'trip',
      idempotencyKey: buildTripIdempotencyKey(`test-order-${person.personId}`),
      amount: 5,
      fromAccountId: emissionAccountId,
      toAccountId: driverAccount.id,
      occurredAt,
    });

    await transferPoints({
      reason: 'order_spend',
      idempotencyKey: buildOrderSpendIdempotencyKey(legacyOrderId),
      amount: 5,
      fromAccountId: driverAccount.id,
      toAccountId: redemptionAccountId,
      occurredAt,
      context: { legacyOrderId },
    });

    expect(await readAccountBalance(person.personId)).toBe(0n);

    const refundKey = buildOrderRefundIdempotencyKey(legacyOrderId);
    const refundInput = {
      reason: 'order_refund',
      idempotencyKey: refundKey,
      amount: 5,
      fromAccountId: redemptionAccountId,
      toAccountId: driverAccount.id,
      occurredAt,
      context: { legacyOrderId },
    } as const;

    const first = await transferPoints({ ...refundInput });
    const second = await transferPoints({ ...refundInput });

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    expect(await countTransfersByKey(refundKey)).toBe(1);
    // Двойная отмена — тот самый баг старого бота: баллы возвращались столько раз,
    // сколько нажали кнопку.
    expect(await readAccountBalance(person.personId)).toBe(5n);
  });

  describe('доменные ошибки', () => {
    it('нехватка баллов — InsufficientPointsError, а не отказ базы', async () => {
      const person = await createTestPerson({ inProgram: true });
      const driverAccount = await ensureDriverAccount(person.personId);

      await expect(
        transferPoints({
          reason: 'order_spend',
          idempotencyKey: buildOrderSpendIdempotencyKey(777001),
          amount: 10,
          fromAccountId: driverAccount.id,
          toAccountId: redemptionAccountId,
          occurredAt: new Date('2026-08-22T09:00:00.000Z'),
        }),
      ).rejects.toBeInstanceOf(InsufficientPointsError);

      expect(await readAccountBalance(person.personId)).toBe(0n);
    });

    it('неизвестный счёт — UnknownAccountError', async () => {
      await expect(
        transferPoints({
          reason: 'manual',
          idempotencyKey: buildManualIdempotencyKey(randomUUID()),
          amount: 1,
          fromAccountId: emissionAccountId,
          toAccountId: '00000000-0000-0000-0000-000000000000',
          occurredAt: new Date('2026-08-22T09:00:00.000Z'),
        }),
      ).rejects.toBeInstanceOf(UnknownAccountError);
    });

    it('тот же ключ на другую операцию — IdempotencyKeyConflictError', async () => {
      const person = await createTestPerson({ inProgram: true });
      const driverAccount = await ensureDriverAccount(person.personId);
      const idempotencyKey = buildTripIdempotencyKey(`test-order-${person.personId}`);

      await transferPoints({
        reason: 'trip',
        idempotencyKey,
        amount: 1,
        fromAccountId: emissionAccountId,
        toAccountId: driverAccount.id,
        occurredAt: new Date('2026-08-22T09:00:00.000Z'),
      });

      await expect(
        transferPoints({
          reason: 'trip',
          idempotencyKey,
          amount: 4,
          fromAccountId: emissionAccountId,
          toAccountId: driverAccount.id,
          occurredAt: new Date('2026-08-22T09:00:00.000Z'),
        }),
      ).rejects.toBeInstanceOf(IdempotencyKeyConflictError);

      expect(await readAccountBalance(person.personId)).toBe(1n);
    });

    it('неположительная сумма и перевод сам себе отбиваются до похода в базу', async () => {
      const person = await createTestPerson({ inProgram: true });
      const driverAccount = await ensureDriverAccount(person.personId);

      await expect(
        transferPoints({
          reason: 'manual',
          idempotencyKey: buildManualIdempotencyKey(randomUUID()),
          amount: 0,
          fromAccountId: emissionAccountId,
          toAccountId: driverAccount.id,
          occurredAt: new Date('2026-08-22T09:00:00.000Z'),
        }),
      ).rejects.toBeInstanceOf(InvalidTransferAmountError);

      await expect(
        transferPoints({
          reason: 'manual',
          idempotencyKey: buildManualIdempotencyKey(randomUUID()),
          amount: 1,
          fromAccountId: driverAccount.id,
          toAccountId: driverAccount.id,
          occurredAt: new Date('2026-08-22T09:00:00.000Z'),
        }),
      ).rejects.toBeInstanceOf(SameAccountTransferError);
    });
  });

  it('водительский счёт заводится один раз, повторный вызов возвращает тот же', async () => {
    const person = await createTestPerson({ inProgram: true });

    const first = await ensureDriverAccount(person.personId);
    const second = await ensureDriverAccount(person.personId);

    expect(second.id).toBe(first.id);
  });
});
