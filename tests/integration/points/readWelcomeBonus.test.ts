import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { awardTripPoints } from '#server/services/points/awardTripPoints';
import { readWelcomeBonus } from '#server/services/points/readWelcomeBonus';
import {
  cleanupTestData,
  createTestPerson,
  createTestTrip,
  disconnectDatabase,
  markPersonAsLegacy,
  type TestPerson,
} from '../support/database';
import { disconnectQueues } from '../support/queues';

/**
 * Счёт до приветственного бонуса — слайд «+300» и строка карточки водителя (issue #410).
 *
 * Настоящей базой: счёт поездок и время выдачи живут сырыми запросами, и обещание обязано
 * считаться тем же правилом, что выдача. Заглушка подтвердила бы работу кода, а не правила.
 */

const JOINED_AT = new Date('2026-10-05T07:00:00.000Z');
const BEFORE_JOIN = new Date('2026-10-04T12:00:00.000Z');
const AFTER_JOIN = new Date('2026-10-06T09:32:00.000Z');

/** Заводит человеку завершённые поездки на одно время и возвращает их идентификаторы заказов. */
const createCompletedTrips = async (
  person: TestPerson,
  count: number,
  endedAt: Date,
  label: string,
): Promise<string[]> => {
  const tripOrderIds: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const tripOrderId = `test-welcome-read-${person.personId}-${label}-${index}`;
    await createTestTrip({ profileId: person.profileId, tripOrderId, status: 'complete', endedAt });
    tripOrderIds.push(tripOrderId);
  }

  return tripOrderIds;
};

describe('счёт до приветственного бонуса', () => {
  afterEach(cleanupTestData);
  afterAll(async () => {
    await disconnectDatabase();
    await disconnectQueues();
  });

  it('не участнику — ничего: считать не от чего', async () => {
    const person = await createTestPerson({ inProgram: false });
    await createCompletedTrips(person, 2, AFTER_JOIN, 'outsider');

    expect(await readWelcomeBonus(person.personId)).toBeNull();
  });

  it('считает только поездки после вступления', async () => {
    // Случай водителя, пришедшего по плакату: поездки до вступления получили баллы доначислением,
    // в истории их пять, а к бонусу из них не идёт ни одна.
    const person = await createTestPerson({ inProgram: true, joinedAt: JOINED_AT });
    await createCompletedTrips(person, 3, BEFORE_JOIN, 'before');
    await createCompletedTrips(person, 2, AFTER_JOIN, 'after');

    expect(await readWelcomeBonus(person.personId)).toEqual({
      state: 'progress',
      done: 2,
      total: 5,
      joinedAt: JOINED_AT,
    });
  });

  it('выданный бонус — со временем перевода', async () => {
    const person = await createTestPerson({ inProgram: true, joinedAt: JOINED_AT });
    const tripOrderIds = await createCompletedTrips(person, 5, AFTER_JOIN, 'awarded');

    const summary = await awardTripPoints(tripOrderIds);

    expect(summary.welcomeAwarded).toBe(1);
    // Время выдачи — время поездки, на которой порог сошёлся, а не время прогона.
    expect(await readWelcomeBonus(person.personId)).toEqual({ state: 'awarded', awardedAt: AFTER_JOIN });
  });

  it('перенесённому из старой базы — не положен, сколько бы поездок ни было', async () => {
    const person = await createTestPerson({ inProgram: true, joinedAt: JOINED_AT });
    await markPersonAsLegacy(person.personId);
    await createCompletedTrips(person, 5, AFTER_JOIN, 'legacy');

    expect(await readWelcomeBonus(person.personId)).toEqual({ state: 'not_eligible' });
  });
});
