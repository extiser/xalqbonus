import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { ensureDriverAccount } from '#server/services/points/ensureDriverAccount';
import { getSystemAccount } from '#server/services/points/getSystemAccount';
import {
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

/**
 * Параллельная запись. Ровно то место, где старый проект терял начисления: одна фоновая
 * задача инкрементировала баланс на стороне базы, другая записывала прочитанное ранее
 * значение (docs/analysis.md). Здесь обе гонки воспроизводятся напрямую.
 *
 * Восемь одновременных операций, а не десять: у пула соединений по умолчанию десять
 * мест, и каждая интерактивная транзакция занимает одно на всё своё время.
 */
const PARALLEL_OPERATIONS = 8;

describe('параллельная запись в журнал', () => {
  let emissionAccountId = '';

  beforeAll(async () => {
    emissionAccountId = (await getSystemAccount('emission')).id;
  });

  afterEach(cleanupTestData);
  afterAll(disconnectDatabase);

  it('одновременные переводы с одним ключом дают одну запись', async () => {
    const person = await createTestPerson({ inProgram: true });
    const driverAccount = await ensureDriverAccount(person.personId);
    const tripOrderId = `test-trip-${person.personId}-race`;
    const idempotencyKey = buildTripIdempotencyKey(tripOrderId);

    const results = await Promise.all(
      Array.from({ length: PARALLEL_OPERATIONS }, () =>
        transferPoints({
          reason: 'trip',
          idempotencyKey,
          amount: 1,
          fromAccountId: emissionAccountId,
          toAccountId: driverAccount.id,
          occurredAt: new Date('2026-08-20T12:00:00.000Z'),
          context: { tripOrderId },
        }),
      ),
    );

    // Записал ровно один вызов, остальные опознали повтор. Глобальный мьютекс для этого
    // не нужен: работает уникальное ограничение, а не порядок действий в коде.
    expect(results.filter((result) => result.applied)).toHaveLength(1);
    expect(new Set(results.map((result) => result.transfer.id)).size).toBe(1);
    expect(await countTransfersByKey(idempotencyKey)).toBe(1);
    expect(await readAccountBalance(person.personId)).toBe(1n);
  });

  it('одновременные разные переводы на один счёт не теряют ни одного балла', async () => {
    const person = await createTestPerson({ inProgram: true });
    const driverAccount = await ensureDriverAccount(person.personId);
    const emissionBefore = await readSystemBalance('emission');

    const results = await Promise.all(
      Array.from({ length: PARALLEL_OPERATIONS }, (_unused, index) => {
        const tripOrderId = `test-trip-${person.personId}-parallel-${index}`;

        return transferPoints({
          reason: 'trip',
          idempotencyKey: buildTripIdempotencyKey(tripOrderId),
          amount: 1,
          fromAccountId: emissionAccountId,
          toAccountId: driverAccount.id,
          occurredAt: new Date('2026-08-20T12:00:00.000Z'),
          context: { tripOrderId },
        });
      }),
    );

    expect(results.every((result) => result.applied)).toBe(true);
    expect(await readAccountBalance(person.personId)).toBe(BigInt(PARALLEL_OPERATIONS));
    expect(await readSystemBalance('emission')).toBe(emissionBefore - BigInt(PARALLEL_OPERATIONS));
  });

  it('встречные переводы между одной парой счетов не встают в дедлок', async () => {
    // Счета блокируются по возрастанию идентификатора независимо от направления перевода.
    // Без этого два встречных перевода берут блокировки в разном порядке и встают намертво.
    const person = await createTestPerson({ inProgram: true });
    const driverAccount = await ensureDriverAccount(person.personId);
    const redemptionAccount = await getSystemAccount('redemption');
    const occurredAt = new Date('2026-08-20T12:00:00.000Z');

    await transferPoints({
      reason: 'trip',
      idempotencyKey: buildTripIdempotencyKey(`test-trip-${person.personId}-seed`),
      amount: PARALLEL_OPERATIONS,
      fromAccountId: emissionAccountId,
      toAccountId: driverAccount.id,
      occurredAt,
    });

    const spendAndRefund = Array.from({ length: PARALLEL_OPERATIONS }, (_unused, index) => {
      const towardsRedemption = index % 2 === 0;

      return transferPoints({
        reason: towardsRedemption ? 'order_spend' : 'order_refund',
        idempotencyKey: towardsRedemption
          ? buildOrderSpendIdempotencyKey(900000 + index)
          : buildOrderRefundIdempotencyKey(900000 + index),
        amount: 1,
        fromAccountId: towardsRedemption ? driverAccount.id : redemptionAccount.id,
        toAccountId: towardsRedemption ? redemptionAccount.id : driverAccount.id,
        occurredAt,
      });
    });

    await expect(Promise.all(spendAndRefund)).resolves.toHaveLength(PARALLEL_OPERATIONS);
    // Списаний и зачислений поровну — баланс вернулся к исходному.
    expect(await readAccountBalance(person.personId)).toBe(BigInt(PARALLEL_OPERATIONS));
  });
});
