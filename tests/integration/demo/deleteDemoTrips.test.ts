import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { db } from '#server/db';
import { markWelcomeBonusSeen } from '#server/repositories/drivers';
import { findDriverAccountReconciliation } from '#server/repositories/points';
import { addDemoTrips } from '#server/services/demo/addDemoTrips';
import { addDemoViewer, DEMO_DRIVER_OPENING_BALANCE } from '#server/services/demo/addDemoViewer';
import { deleteDemoTrips } from '#server/services/demo/deleteDemoTrips';
import { DemoTripNotFoundError, NotDemoDriverError } from '#server/services/demo/errors';
import { WELCOME_BONUS_POINTS } from '#server/services/points/awardWelcomeBonus';
import { readWelcomeBonus } from '#server/services/points/readWelcomeBonus';
import { COMPLETED_TRIP_STATUS } from '#server/utils/tripStatus';
import {
  cleanupTestData,
  countTransfersByReason,
  createTestPerson,
  createTestTrip,
  disconnectDatabase,
  readAccountBalance,
  readSystemBalance,
} from '../support/database';
import { cleanupTestDemo, trackTestDemoViewer } from '../support/demo';
import { cleanupTestEmployees, linkTestDriver, nextTestTelegramUserId } from '../support/employees';
import { disconnectQueues } from '../support/queues';

/**
 * Удаление поездок демо-водителя (issue #422): исключение из «баланс меняется только записью
 * в журнал» — записи удаляются, кэш откатывается. Поэтому проверяется по журналу, кэшу
 * и сверке счёта, а не по ответу сервиса.
 */

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const readTripOrderIds = async (personId: string): Promise<string[]> => {
  const rows = await db.$queryRaw<{ orderId: string }[]>`
    SELECT trip."order_id" AS "orderId"
      FROM xb.trips AS trip
      JOIN xb.park_profiles AS profile ON profile."profile_id" = trip."profile_id"
     WHERE profile."person_id" = ${personId}::uuid
     ORDER BY trip."ended_at" DESC
  `;

  return rows.map((row) => row.orderId);
};

const readWelcomeBonusSeenAt = async (personId: string): Promise<Date | null> => {
  const rows = await db.$queryRaw<{ seenAt: Date | null }[]>`
    SELECT "welcome_bonus_seen_at" AS "seenAt" FROM xb.person_settings WHERE "person_id" = ${personId}::uuid
  `;

  return rows[0]?.seenAt ?? null;
};

/** Сумма переводов, зачисленных на счёт водителя, — по журналу, мимо кэша. */
const readIncomingTransfersTotal = async (personId: string): Promise<bigint> => {
  const rows = await db.$queryRaw<{ total: bigint }[]>`
    SELECT coalesce(sum(transfer."amount"), 0)::bigint AS "total"
      FROM xb.point_transfers AS transfer
      JOIN xb.accounts AS account ON account."id" = transfer."to_account_id"
     WHERE account."person_id" = ${personId}::uuid
  `;

  return rows[0]?.total ?? 0n;
};

const createDemoDriver = async (): Promise<string> => {
  const source = await createTestPerson({ inProgram: true });
  await linkTestDriver(source.personId, nextTestTelegramUserId());

  const telegramUserId = nextTestTelegramUserId();
  const result = await addDemoViewer({ telegramUserId, label: 'удаление', now: new Date(Date.now() - DAY_MS) });

  if (!('personId' in result)) {
    throw new Error(`демо-водитель не заведён: ${result.outcome}`);
  }

  trackTestDemoViewer(telegramUserId, result.personId);

  return result.personId;
};

describe('удаление поездок демо-водителя', () => {
  afterEach(async () => {
    await cleanupTestDemo();
    await cleanupTestEmployees();
    await cleanupTestData();
  });
  afterAll(async () => {
    await disconnectDatabase();
    await disconnectQueues();
  });

  it('по одной: бонус держится, пока поездок пять, и снимается на четвёртой', async () => {
    const personId = await createDemoDriver();

    expect(await addDemoTrips({ personId, endedAt: new Date(Date.now() - MINUTE_MS), count: 6 })).toEqual({
      written: 6,
      awarded: 6,
      welcomeAwarded: 1,
    });
    await markWelcomeBonusSeen(personId, new Date());

    const fullBalance = BigInt(DEMO_DRIVER_OPENING_BALANCE + 6 + WELCOME_BONUS_POINTS);
    expect(await readAccountBalance(personId)).toBe(fullBalance);

    const [first, second] = await readTripOrderIds(personId);

    // Осталось пять — бонус на месте, снят только балл за поездку.
    expect(await deleteDemoTrips({ personId, orderId: first! })).toEqual({
      deletedTrips: 1,
      deletedPoints: 1,
      welcomeBonusRemoved: false,
    });
    expect(await readAccountBalance(personId)).toBe(fullBalance - 1n);
    expect(await countTransfersByReason(personId, 'welcome')).toBe(1);
    expect(await readWelcomeBonusSeenAt(personId)).not.toBeNull();

    // Осталось четыре — бонус снят вместе с отметкой «Спасибо».
    expect(await deleteDemoTrips({ personId, orderId: second! })).toEqual({
      deletedTrips: 1,
      deletedPoints: 1 + WELCOME_BONUS_POINTS,
      welcomeBonusRemoved: true,
    });
    expect(await readAccountBalance(personId)).toBe(BigInt(DEMO_DRIVER_OPENING_BALANCE + 4));
    expect(await countTransfersByReason(personId, 'welcome')).toBe(0);
    expect(await countTransfersByReason(personId, 'trip')).toBe(4);
    expect(await readWelcomeBonusSeenAt(personId)).toBeNull();
    expect(await readTripOrderIds(personId)).toHaveLength(4);

    const bonus = await readWelcomeBonus(personId);
    expect(bonus).toMatchObject({ state: 'progress', done: 4, total: 5 });
  });

  it('все: поездок нет, остаётся `demo_grant`, счёт сходится с журналом, эмиссия вернулась', async () => {
    const personId = await createDemoDriver();
    const emissionBefore = await readSystemBalance('emission');

    await addDemoTrips({ personId, endedAt: new Date(Date.now() - MINUTE_MS), count: 7 });

    expect(await deleteDemoTrips({ personId, orderId: null })).toEqual({
      deletedTrips: 7,
      deletedPoints: 7 + WELCOME_BONUS_POINTS,
      welcomeBonusRemoved: true,
    });

    expect(await readTripOrderIds(personId)).toEqual([]);
    expect(await countTransfersByReason(personId, 'trip')).toBe(0);
    expect(await countTransfersByReason(personId, 'welcome')).toBe(0);
    expect(await countTransfersByReason(personId, 'demo_grant')).toBe(1);

    const balance = await readAccountBalance(personId);
    expect(balance).toBe(BigInt(DEMO_DRIVER_OPENING_BALANCE));
    expect(balance).toBe(await readIncomingTransfersTotal(personId));

    const reconciliation = await findDriverAccountReconciliation(personId);
    expect(reconciliation?.cachedBalance).toBe(reconciliation?.journalBalance);

    expect(await readSystemBalance('emission')).toBe(emissionBefore);
  });

  it('после очистки бонус выдаётся снова на пятой поездке', async () => {
    const personId = await createDemoDriver();

    await addDemoTrips({ personId, endedAt: new Date(Date.now() - 10 * MINUTE_MS), count: 5 });
    await deleteDemoTrips({ personId, orderId: null });

    expect(await addDemoTrips({ personId, endedAt: new Date(Date.now() - MINUTE_MS), count: 4 })).toMatchObject({
      welcomeAwarded: 0,
    });
    expect(await addDemoTrips({ personId, endedAt: new Date(Date.now() - MINUTE_MS), count: 1 })).toMatchObject({
      welcomeAwarded: 1,
    });
    expect(await countTransfersByReason(personId, 'welcome')).toBe(1);
    expect(await readAccountBalance(personId)).toBe(BigInt(DEMO_DRIVER_OPENING_BALANCE + 5 + WELCOME_BONUS_POINTS));
  });

  it('живому человеку отказывает и не трогает его поездку, даже с префиксом `demo-`', async () => {
    const live = await createTestPerson({ inProgram: true });
    const tripOrderId = `demo-${randomUUID()}`;

    await createTestTrip({
      profileId: live.profileId,
      tripOrderId,
      status: COMPLETED_TRIP_STATUS,
      endedAt: new Date(Date.now() - MINUTE_MS),
    });

    await expect(deleteDemoTrips({ personId: live.personId, orderId: null })).rejects.toBeInstanceOf(
      NotDemoDriverError,
    );
    await expect(deleteDemoTrips({ personId: live.personId, orderId: tripOrderId })).rejects.toBeInstanceOf(
      NotDemoDriverError,
    );
    expect(await readTripOrderIds(live.personId)).toEqual([tripOrderId]);
  });

  it('чужой заказ — отказ «нет такой поездки», ничего не удалено', async () => {
    const personId = await createDemoDriver();

    await addDemoTrips({ personId, endedAt: new Date(Date.now() - MINUTE_MS), count: 2 });

    await expect(deleteDemoTrips({ personId, orderId: `demo-${randomUUID()}` })).rejects.toBeInstanceOf(
      DemoTripNotFoundError,
    );
    expect(await readTripOrderIds(personId)).toHaveLength(2);
    expect(await readAccountBalance(personId)).toBe(BigInt(DEMO_DRIVER_OPENING_BALANCE + 2));
  });
});
