import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { openLegacyReadSession, type LegacyReadSession } from '#server/repositories/legacyPublic';
import {
  importLegacyAwardedTrips,
  LEGACY_AWARDED_TRIPS_DAYS,
} from '#server/services/legacyImport/importLegacyAwardedTrips';
import { awardTripPoints } from '#server/services/points/awardTripPoints';
import { buildTripIdempotencyKey } from '#server/services/points/idempotencyKey';
import { db } from '#server/db';
import {
  cleanupTestData,
  countTransfersByKey,
  createTestPerson,
  createTestTrip,
  disconnectDatabase,
  markTripAwardedByLegacy,
  readAccountBalance,
  trackLegacyAwardedTrips,
  type TestPerson,
} from '../support/database';
import {
  clearLegacyTrips,
  createLegacyTripsTable,
  dropLegacyTripsTable,
  insertLegacyTrips,
  type LegacyTripInput,
} from '../support/legacyPublic';
import { disconnectQueues } from '../support/queues';

/**
 * Граница со старым ботом — по засчитанным заказам (issue #274).
 *
 * Баланс переносится одной операцией `opening`, и балл старого бота за поездку уже лежит
 * в нём. Заказ, который старый бот засчитал, наш сборщик не начисляет; заказ, застывший
 * у старого бота в промежуточном статусе, начисляет обычным порядком.
 */

const COMPLETED_AT = new Date('2026-09-27T12:00:00.000Z');
const DAY_MS = 86_400_000;

const createCompletedTrip = async (person: TestPerson, suffix: string): Promise<string> => {
  const tripOrderId = `test-trip-${person.personId}-${suffix}`;

  await createTestTrip({
    profileId: person.profileId,
    tripOrderId,
    status: 'complete',
    endedAt: COMPLETED_AT,
  });

  return tripOrderId;
};

const readLegacyAwardedRows = async (orderIds: readonly string[]) =>
  db.$queryRaw<{ orderId: string; legacyDriverId: number }[]>`
    SELECT "order_id" AS "orderId", "legacy_driver_id" AS "legacyDriverId"
      FROM xb.legacy_awarded_trips
     WHERE "order_id" = ANY(${[...orderIds]}::text[])
     ORDER BY "order_id"
  `;

describe('граница со старым ботом по засчитанным заказам', () => {
  let legacy: LegacyReadSession;

  beforeAll(async () => {
    await createLegacyTripsTable();
    // Тем же сеансом только на чтение, что у переноса: шаг читает `public` им и ничем иным.
    legacy = await openLegacyReadSession(process.env.DATABASE_URL ?? '');
  });

  afterEach(async () => {
    await clearLegacyTrips();
    await cleanupTestData();
  });

  afterAll(async () => {
    await legacy.close();
    await dropLegacyTripsTable();
    await disconnectDatabase();
    await disconnectQueues();
  });

  describe('начисление', () => {
    it('заказ, засчитанный старым ботом, не начисляется, остальные — как прежде', async () => {
      const person = await createTestPerson({ inProgram: true });
      const legacyTrip = await createCompletedTrip(person, 'legacy');
      const ourTrip = await createCompletedTrip(person, 'ours');

      await markTripAwardedByLegacy(legacyTrip);

      const summary = await awardTripPoints([legacyTrip, ourTrip]);

      expect(summary.awardedByLegacy).toBe(1);
      expect(summary.awarded).toBe(1);
      expect(summary.alreadyAwarded).toBe(0);
      expect(await countTransfersByKey(buildTripIdempotencyKey(legacyTrip))).toBe(0);
      expect(await countTransfersByKey(buildTripIdempotencyKey(ourTrip))).toBe(1);
      expect(await readAccountBalance(person.personId)).toBe(1n);
    });

    it('повторный прогон ничего не меняет', async () => {
      const person = await createTestPerson({ inProgram: true });
      const legacyTrip = await createCompletedTrip(person, 'legacy');
      const ourTrip = await createCompletedTrip(person, 'ours');

      await markTripAwardedByLegacy(legacyTrip);

      await awardTripPoints([legacyTrip, ourTrip]);
      const repeat = await awardTripPoints([legacyTrip, ourTrip]);

      // Засчитанный старым ботом пропускается окончательно и на повторе снова считается
      // своей причиной, а не «уже начисленным»: балла за него в нашем журнале нет.
      expect(repeat.awardedByLegacy).toBe(1);
      expect(repeat.awarded).toBe(0);
      expect(repeat.alreadyAwarded).toBe(1);
      expect(await countTransfersByKey(buildTripIdempotencyKey(legacyTrip))).toBe(0);
      expect(await readAccountBalance(person.personId)).toBe(1n);
    });

    it('по засчитанным старым ботом заказам приветственный бонус не проверяется', async () => {
      // Новичок по правилу бонуса — строки в карте переноса у него нет. Пять завершённых
      // поездок, все засчитаны старым ботом: прогон по ним не доходит ни до балла, ни до бонуса.
      const person = await createTestPerson({ inProgram: true });
      const legacyTrips: string[] = [];

      for (let index = 0; index < 5; index += 1) {
        const tripOrderId = await createCompletedTrip(person, `legacy-${index}`);
        await markTripAwardedByLegacy(tripOrderId);
        legacyTrips.push(tripOrderId);
      }

      const summary = await awardTripPoints(legacyTrips);

      expect(summary.awardedByLegacy).toBe(5);
      expect(summary.welcomeAwarded).toBe(0);
      expect(await readAccountBalance(person.personId)).toBe(0n);
    });
  });

  describe('шаг переноса', () => {
    it('берёт только complete за 14 дней, дубли схлопывает, повтор не добавляет строк', async () => {
      const startedAt = new Date();
      const daysAgo = (days: number): Date => new Date(startedAt.getTime() - days * DAY_MS);
      const tripId = (suffix: string): string =>
        `test-legacy-awarded-${startedAt.getTime()}-${suffix}`;

      const fixture: LegacyTripInput[] = [
        { tripId: tripId('fresh'), driverId: 101, bookedAt: daysAgo(1), status: 'complete' },
        {
          tripId: tripId('edge'),
          driverId: 102,
          bookedAt: daysAgo(LEGACY_AWARDED_TRIPS_DAYS - 1),
          status: 'complete',
        },
        {
          tripId: tripId('old'),
          driverId: 103,
          bookedAt: daysAgo(LEGACY_AWARDED_TRIPS_DAYS + 1),
          status: 'complete',
        },
        // Застывшие у старого бота: балла за них нет, в таблицу они не попадают.
        {
          tripId: tripId('transporting'),
          driverId: 104,
          bookedAt: daysAgo(1),
          status: 'transporting',
        },
        { tripId: tripId('driving'), driverId: 105, bookedAt: daysAgo(2), status: 'driving' },
        { tripId: tripId('waiting'), driverId: 106, bookedAt: daysAgo(3), status: 'waiting' },
        // Дубль `trip_id`: берётся самая ранняя строка по `id` — та, что вставлена первой.
        { tripId: tripId('duplicate'), driverId: 107, bookedAt: daysAgo(2), status: 'complete' },
        { tripId: tripId('duplicate'), driverId: 108, bookedAt: daysAgo(2), status: 'complete' },
      ];

      const fixtureOrderIds = [...new Set(fixture.map((trip) => trip.tripId))];
      trackLegacyAwardedTrips(fixtureOrderIds);

      await insertLegacyTrips(fixture);

      const first = await importLegacyAwardedTrips(legacy, startedAt);

      expect(first.bookedSince).toEqual(daysAgo(LEGACY_AWARDED_TRIPS_DAYS));
      expect(first.read).toBe(3);
      expect(first.inserted).toBe(3);
      expect(await readLegacyAwardedRows(fixtureOrderIds)).toEqual([
        { orderId: tripId('duplicate'), legacyDriverId: 107 },
        { orderId: tripId('edge'), legacyDriverId: 102 },
        { orderId: tripId('fresh'), legacyDriverId: 101 },
      ]);

      const repeat = await importLegacyAwardedTrips(legacy, startedAt);

      expect(repeat.read).toBe(3);
      expect(repeat.inserted).toBe(0);
      expect(await readLegacyAwardedRows(fixtureOrderIds)).toHaveLength(3);
    });

    it('застывший у старого бота заказ начисляется нашим сборщиком', async () => {
      const startedAt = new Date();
      const person = await createTestPerson({ inProgram: true });
      const frozenTrip = `test-trip-${person.personId}-frozen`;
      const legacyTrip = `test-trip-${person.personId}-legacy-complete`;

      trackLegacyAwardedTrips([frozenTrip, legacyTrip]);

      // У старого бота первый застыл в `transporting`, второй засчитан.
      const bookedAt = new Date(startedAt.getTime() - DAY_MS);

      await insertLegacyTrips([
        { tripId: frozenTrip, driverId: 201, bookedAt, status: 'transporting' },
        { tripId: legacyTrip, driverId: 201, bookedAt, status: 'complete' },
      ]);

      await importLegacyAwardedTrips(legacy, startedAt);

      // Наш сборщик видит оба завершёнными.
      for (const tripOrderId of [frozenTrip, legacyTrip]) {
        await createTestTrip({
          profileId: person.profileId,
          tripOrderId,
          status: 'complete',
          endedAt: COMPLETED_AT,
        });
      }

      const summary = await awardTripPoints([frozenTrip, legacyTrip]);

      expect(summary.awarded).toBe(1);
      expect(summary.awardedByLegacy).toBe(1);
      expect(await countTransfersByKey(buildTripIdempotencyKey(frozenTrip))).toBe(1);
      expect(await readAccountBalance(person.personId)).toBe(1n);
    });
  });
});
