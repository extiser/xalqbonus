import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { db } from '#server/db';
import { readSyncDataBoundaries, readSyncPeriodCounts } from '#server/repositories/syncSummary';
import { addDemoTrips } from '#server/services/demo/addDemoTrips';
import { addDemoViewer, DEMO_DRIVER_OPENING_BALANCE } from '#server/services/demo/addDemoViewer';
import { InvalidDemoTripsError, NotDemoDriverError } from '#server/services/demo/errors';
import {
  cleanupTestData,
  countTransfersByReason,
  createTestPerson,
  disconnectDatabase,
  readAccountBalance,
} from '../support/database';
import { cleanupTestDemo, trackTestDemoViewer } from '../support/demo';
import { cleanupTestEmployees, linkTestDriver, nextTestTelegramUserId } from '../support/employees';
import { disconnectQueues } from '../support/queues';

/**
 * Поездки демо-водителю руками (issue #213): пишутся тем же `upsertTrips` и начисляются тем же
 * `awardTripPoints`, что поездки синхронизации, — поэтому и проверяются по журналу и балансу,
 * а не по ответу сервиса. Свод синхронизации их не видит.
 */

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

type DemoTripRow = { orderId: string; endedAt: Date; syncRunId: string | null; status: string };

const readTrips = (personId: string): Promise<DemoTripRow[]> =>
  db.$queryRaw<DemoTripRow[]>`
    SELECT trip."order_id"    AS "orderId",
           trip."ended_at"    AS "endedAt",
           trip."sync_run_id" AS "syncRunId",
           trip."status"
      FROM xb.trips AS trip
      JOIN xb.park_profiles AS profile ON profile."profile_id" = trip."profile_id"
     WHERE profile."person_id" = ${personId}::uuid
     ORDER BY trip."ended_at"
  `;

const readTripAwardTimes = (personId: string): Promise<{ occurredAt: Date }[]> =>
  db.$queryRaw<{ occurredAt: Date }[]>`
    SELECT transfer."occurred_at" AS "occurredAt"
      FROM xb.point_transfers AS transfer
      JOIN xb.accounts AS account ON account."id" = transfer."to_account_id"
     WHERE account."person_id" = ${personId}::uuid
       AND transfer."reason" = 'trip'::xb.point_reason
     ORDER BY transfer."occurred_at"
  `;

/** Демо-водитель, вступивший `joinedAt`, — сутки назад, если не сказано иное. */
const createDemoDriver = async (joinedAt = new Date(Date.now() - DAY_MS)): Promise<string> => {
  const source = await createTestPerson({ inProgram: true });
  await linkTestDriver(source.personId, nextTestTelegramUserId());

  const telegramUserId = nextTestTelegramUserId();
  const result = await addDemoViewer({ telegramUserId, label: 'поездки', now: joinedAt });

  if (!('personId' in result)) {
    throw new Error(`демо-водитель не заведён: ${result.outcome}`);
  }

  trackTestDemoViewer(telegramUserId, result.personId);

  return result.personId;
};

describe('ручные поездки демо-водителю', () => {
  afterEach(async () => {
    await cleanupTestDemo();
    await cleanupTestEmployees();
    await cleanupTestData();
  });
  afterAll(async () => {
    await disconnectDatabase();
    await disconnectQueues();
  });

  it('пишет поездки с шагом в минуту и начисляет по баллу за каждую временем поездки', async () => {
    const personId = await createDemoDriver();
    const endedAt = new Date(Date.now() - MINUTE_MS);

    const result = await addDemoTrips({ personId, endedAt, count: 5 });

    // Пятая поездка после вступления — живая механика целиком, с приветственным бонусом.
    expect(result).toEqual({ written: 5, awarded: 5, welcomeAwarded: 1 });

    const trips = await readTrips(personId);
    const expectedTimes = [4, 3, 2, 1, 0].map((minutes) => endedAt.getTime() - minutes * MINUTE_MS);

    expect(trips.map((trip) => trip.endedAt.getTime())).toEqual(expectedTimes);
    expect(trips.every((trip) => trip.orderId.startsWith('demo-'))).toBe(true);
    expect(trips.every((trip) => trip.syncRunId === null)).toBe(true);
    expect(trips.every((trip) => trip.status === 'complete')).toBe(true);

    const awards = await readTripAwardTimes(personId);

    expect(awards.map((award) => award.occurredAt.getTime())).toEqual(expectedTimes);
    expect(await countTransfersByReason(personId, 'welcome')).toBe(1);
    expect(await readAccountBalance(personId)).toBe(BigInt(DEMO_DRIVER_OPENING_BALANCE + 5 + 300));
  });

  it('каждый запрос — новые поездки: повтор добавляет, а не перезаписывает', async () => {
    const personId = await createDemoDriver();
    const endedAt = new Date(Date.now() - MINUTE_MS);

    await addDemoTrips({ personId, endedAt, count: 2 });
    const again = await addDemoTrips({ personId, endedAt, count: 2 });

    expect(again).toEqual({ written: 2, awarded: 2, welcomeAwarded: 0 });
    expect(await countTransfersByReason(personId, 'trip')).toBe(4);
  });

  it('живому водителю отказывает и ничего не пишет', async () => {
    const live = await createTestPerson({ inProgram: true });

    await expect(
      addDemoTrips({ personId: live.personId, endedAt: new Date(), count: 1 }),
    ).rejects.toBeInstanceOf(NotDemoDriverError);
    expect(await readTrips(live.personId)).toEqual([]);
  });

  it('отказывает на поездку в будущем и на количество вне 1–30', async () => {
    const personId = await createDemoDriver();
    const now = new Date();

    const problemOf = async (endedAt: Date, count: number): Promise<string | null> => {
      try {
        await addDemoTrips({ personId, endedAt, count, now });
        return null;
      } catch (error) {
        return error instanceof InvalidDemoTripsError ? error.problem : 'unexpected';
      }
    };

    expect(await problemOf(new Date(now.getTime() + MINUTE_MS), 1)).toBe('ended_at_future');
    expect(await problemOf(new Date(Number.NaN), 1)).toBe('ended_at_invalid');
    expect(await problemOf(now, 0)).toBe('count_invalid');
    expect(await problemOf(now, 31)).toBe('count_invalid');
    expect(await problemOf(now, 1.5)).toBe('count_invalid');
    expect(await readTrips(personId)).toEqual([]);
  });

  it('свод синхронизации ручных поездок не видит', async () => {
    const personId = await createDemoDriver(new Date('2000-01-01T00:00:00Z'));
    const from = new Date('2000-01-01T00:00:00Z');

    const countsBefore = await readSyncPeriodCounts(from);
    const boundariesBefore = await readSyncDataBoundaries();

    await addDemoTrips({ personId, endedAt: new Date('2000-01-02T12:00:00Z'), count: 3 });
    await addDemoTrips({ personId, endedAt: new Date(Date.now() - MINUTE_MS), count: 3 });

    expect(await countTransfersByReason(personId, 'trip')).toBe(6);
    expect(await readSyncPeriodCounts(from)).toEqual(countsBefore);
    expect(await readSyncDataBoundaries()).toEqual(boundariesBefore);
  });
});
