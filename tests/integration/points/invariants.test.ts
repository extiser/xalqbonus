import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { importBalances } from '#server/services/legacyImport/importBalances';
import type { LegacyMatch } from '#server/services/legacyImport/matchLegacyDrivers';
import { adjustPointsManually } from '#server/services/points/adjustPointsManually';
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
import { cleanupTestEmployees, createTestEmployee } from '../support/employees';
import { disconnectQueues } from '../support/queues';

/**
 * Четыре инварианта журнала из docs/points.md. Запросы берутся из scripts/invariants.sql —
 * того же файла, который гоняет `make invariants`. Своя копия запросов разошлась бы
 * с оригиналом на первой же правке, и тест начал бы проверять не то, что команда.
 */
const INVARIANTS_PATH = new URL('../../../scripts/invariants.sql', import.meta.url);

/** Долг из старой базы — одна запись после сопоставления, как её отдаёт шаг сопоставления. */
const legacyDebt = (personId: string, points: number): LegacyMatch => ({
  row: {
    legacyDriverId: -910_001,
    profileId: `test-profile-${personId}`,
    points,
    chatId: null,
    language: 'ru',
    createdAt: new Date('2026-09-28T06:00:00.000Z'),
  },
  profileId: `test-profile-${personId}`,
  personId,
  matchMethod: 'profile_id',
  mergedIntoLegacyDriverId: null,
  telegramStatus: 'skipped',
  chatId: null,
  points,
});

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

  afterEach(async () => {
    await cleanupTestData();
    await cleanupTestEmployees();
  });
  afterAll(async () => {
    await disconnectDatabase();
    await disconnectQueues();
  });

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
    // Идентификатор заказа случайный, и контекстную колонку перевод не несёт: проверяются
    // инварианты журнала, а не заказ, — он со своими инвариантами лежит
    // в tests/integration/orders/.
    const orderId = randomUUID();

    // Списание и возврат — чтобы в журнале оказались переводы в обе стороны.
    await transferPoints({
      reason: 'order_spend',
      idempotencyKey: buildOrderSpendIdempotencyKey(orderId),
      amount: 2,
      fromAccountId: driverAccount.id,
      toAccountId: redemptionAccountId,
      occurredAt: completedAt,
    });

    await transferPoints({
      reason: 'order_refund',
      idempotencyKey: buildOrderRefundIdempotencyKey(orderId),
      amount: 2,
      fromAccountId: redemptionAccountId,
      toAccountId: driverAccount.id,
      occurredAt: completedAt,
    });

    // Ручная правка в обе стороны — сервисом, с автором: так она приходит из карточки.
    const { employeeId } = await createTestEmployee({ role: 'owner' });
    await adjustPointsManually({
      personId: participant.personId,
      amount: 4,
      note: 'начисление в серии',
      employeeId,
    });
    await adjustPointsManually({
      personId: participant.personId,
      amount: -5,
      note: 'списание в серии',
      employeeId,
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

  describe('минус на водительском счёте (issue #276)', () => {
    it('долг из переноса проходит все четыре запроса, и отработанный поездкой тоже', async () => {
      const person = await createTestPerson({ inProgram: true });
      await importBalances([legacyDebt(person.personId, -1_844)], new Date('2026-09-28T06:00:00.000Z'));

      for (const query of queries) {
        await expect(runRawQuery(query)).resolves.toEqual([]);
      }

      const tripOrderId = `test-trip-${person.personId}-0`;
      await createTestTrip({
        profileId: person.profileId,
        tripOrderId,
        status: 'complete',
        endedAt: new Date('2026-09-28T09:00:00.000Z'),
      });
      await awardTripPoints([tripOrderId]);

      for (const query of queries) {
        await expect(runRawQuery(query)).resolves.toEqual([]);
      }
    });

    it('минус без долга из переноса ловится четвёртым', async () => {
      const person = await createTestPerson({ inProgram: true });
      await ensureDriverAccount(person.personId);
      await breakBalanceCacheForTest(person.personId, -5);

      const fourthInvariant = queries[3]!;

      await expect(runRawQuery(fourthInvariant)).resolves.toEqual([
        expect.objectContaining({ person_id: person.personId, balance: -5n, opening_debt: 0n }),
      ]);
    });

    it('минус глубже долга из переноса ловится четвёртым', async () => {
      const person = await createTestPerson({ inProgram: true });
      await importBalances([legacyDebt(person.personId, -10)], new Date('2026-09-28T06:00:00.000Z'));
      await breakBalanceCacheForTest(person.personId, -1);

      const fourthInvariant = queries[3]!;

      await expect(runRawQuery(fourthInvariant)).resolves.toEqual([
        expect.objectContaining({ person_id: person.personId, balance: -11n }),
      ]);
    });
  });
});
