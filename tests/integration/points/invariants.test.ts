import { readFileSync } from 'node:fs';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { awardTripPoints } from '#server/services/points/awardTripPoints';
import { ensureDriverAccount } from '#server/services/points/ensureDriverAccount';
import { getSystemAccount } from '#server/services/points/getSystemAccount';
import {
  buildOrderRefundIdempotencyKey,
  buildOrderSpendIdempotencyKey,
} from '#server/services/points/idempotencyKey';
import { transferPoints } from '#server/services/points/transfer';
import {
  breakBalanceCacheForTest,
  cleanupTestData,
  createTestPerson,
  createTestTrip,
  disconnectDatabase,
  runRawQuery,
} from '../support/database';

/**
 * Четыре инварианта журнала из docs/points.md. Запросы берутся из scripts/invariants.sql —
 * того же файла, который гоняет `make invariants`. Своя копия запросов разошлась бы
 * с оригиналом на первой же правке, и тест начал бы проверять не то, что команда.
 */
const INVARIANTS_PATH = new URL('../../../scripts/invariants.sql', import.meta.url);

const readInvariantQueries = (): string[] => {
  const source = readFileSync(INVARIANTS_PATH, 'utf8');
  const blocks = [...source.matchAll(/-- invariant:begin \d+\n([\s\S]*?)\n-- invariant:end/g)];

  return blocks.map((block) => block[1]!.trim());
};

describe('инварианты журнала', () => {
  const queries = readInvariantQueries();
  let redemptionAccountId = '';

  beforeAll(async () => {
    redemptionAccountId = (await getSystemAccount('redemption')).id;
  });

  afterEach(cleanupTestData);
  afterAll(disconnectDatabase);

  it('в файле лежат ровно четыре запроса', () => {
    // Пятый инвариант появляется правкой docs/points.md, а не молча.
    expect(queries).toHaveLength(4);
  });

  it('после серии операций все четыре запроса возвращают пусто', async () => {
    const participant = await createTestPerson({ inProgram: true });
    const outsider = await createTestPerson({ inProgram: false });
    const completedAt = new Date('2026-08-20T12:00:00.000Z');

    for (let index = 0; index < 4; index += 1) {
      await createTestTrip({
        profileId: participant.profileId,
        tripOrderId: `test-trip-${participant.personId}-${index}`,
        status: index === 3 ? 'driving' : 'complete',
        endedAt: index === 3 ? null : completedAt,
      });
    }

    await createTestTrip({
      profileId: outsider.profileId,
      tripOrderId: `test-trip-${outsider.personId}-0`,
      status: 'complete',
      endedAt: completedAt,
    });

    // Начисление, перекрытое повторным прогоном, — плюс три балла.
    const tripOrderIds = [
      `test-trip-${participant.personId}-0`,
      `test-trip-${participant.personId}-1`,
      `test-trip-${participant.personId}-2`,
      `test-trip-${participant.personId}-3`,
      `test-trip-${outsider.personId}-0`,
    ];
    await awardTripPoints(tripOrderIds);
    await awardTripPoints(tripOrderIds);

    const driverAccount = await ensureDriverAccount(participant.personId);
    const legacyOrderId = 555001;

    // Списание и возврат — чтобы в журнале оказались переводы в обе стороны.
    await transferPoints({
      reason: 'order_spend',
      idempotencyKey: buildOrderSpendIdempotencyKey(legacyOrderId),
      amount: 2,
      fromAccountId: driverAccount.id,
      toAccountId: redemptionAccountId,
      occurredAt: completedAt,
      context: { legacyOrderId },
    });

    await transferPoints({
      reason: 'order_refund',
      idempotencyKey: buildOrderRefundIdempotencyKey(legacyOrderId),
      amount: 2,
      fromAccountId: redemptionAccountId,
      toAccountId: driverAccount.id,
      occurredAt: completedAt,
      context: { legacyOrderId },
    });

    for (const query of queries) {
      await expect(runRawQuery(query)).resolves.toEqual([]);
    }
  });

  it('правка баланса мимо журнала ловится вторым инвариантом', async () => {
    // Проверка, которая не умеет падать, ничего не проверяет. Здесь баланс правится
    // напрямую — ровно то, что делает старый бот и что сверка обязана показать.
    const person = await createTestPerson({ inProgram: true });
    await ensureDriverAccount(person.personId);
    await breakBalanceCacheForTest(person.personId, 7);

    const [firstInvariant, secondInvariant] = queries;

    await expect(runRawQuery(secondInvariant!)).resolves.not.toEqual([]);
    // Остальные инварианты при этом сходятся: расхождение именно в кэше баланса.
    await expect(runRawQuery(firstInvariant!)).resolves.toEqual([]);
  });
});
