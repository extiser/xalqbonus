import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { awardTripPoints } from '#server/services/points/awardTripPoints';
import { buildWelcomeIdempotencyKey } from '#server/services/points/idempotencyKey';
import {
  cleanupTestData,
  countTransfersByKey,
  createTestPerson,
  createTestTrip,
  disconnectDatabase,
  markPersonAsLegacy,
  readAccountBalance,
  reassignProfileToPerson,
  setTripStatus,
  type TestPerson,
} from '../support/database';

/**
 * Приветственный бонус: 300 баллов после пяти завершённых поездок, только новым участникам.
 *
 * Проверяется настоящей базой, а не заглушкой: и порог, и запрет перенесённым живут
 * запросами, а повторная выдача исключается уникальным ограничением на ключ — заглушка
 * подтвердила бы работу кода, а не работу правила.
 */

const WELCOME_BONUS_POINTS = 300n;

const COMPLETED_AT = new Date('2026-09-10T12:00:00.000Z');

/** Заводит человеку завершённые поездки и возвращает их идентификаторы заказов. */
const createCompletedTrips = async (person: TestPerson, count: number): Promise<string[]> => {
  const tripOrderIds: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const tripOrderId = `test-welcome-${person.personId}-${index}`;
    await createTestTrip({
      profileId: person.profileId,
      tripOrderId,
      status: 'complete',
      endedAt: COMPLETED_AT,
    });
    tripOrderIds.push(tripOrderId);
  }

  return tripOrderIds;
};

describe('приветственный бонус', () => {
  afterEach(cleanupTestData);
  afterAll(disconnectDatabase);

  it('выдаётся на пятой поездке и ровно один раз', async () => {
    const person = await createTestPerson({ inProgram: true });
    // Четыре поездки, записанные и начисленные, — порог ещё не сошёлся.
    const tripOrderIds = await createCompletedTrips(person, 4);

    const beforeThreshold = await awardTripPoints(tripOrderIds);

    expect(beforeThreshold.welcomeAwarded).toBe(0);
    expect(await readAccountBalance(person.personId)).toBe(4n);

    const fifthTripOrderId = `test-welcome-${person.personId}-fifth`;
    await createTestTrip({
      profileId: person.profileId,
      tripOrderId: fifthTripOrderId,
      status: 'complete',
      endedAt: COMPLETED_AT,
    });

    const atThreshold = await awardTripPoints([fifthTripOrderId]);

    expect(atThreshold.welcomeAwarded).toBe(1);
    expect(await readAccountBalance(person.personId)).toBe(5n + WELCOME_BONUS_POINTS);

    // Шестая поездка добавляет свой балл и ничего сверх него.
    const sixthTripOrderId = `test-welcome-${person.personId}-sixth`;
    await createTestTrip({
      profileId: person.profileId,
      tripOrderId: sixthTripOrderId,
      status: 'complete',
      endedAt: COMPLETED_AT,
    });

    const afterThreshold = await awardTripPoints([sixthTripOrderId]);

    expect(afterThreshold.welcomeAwarded).toBe(0);
    expect(await readAccountBalance(person.personId)).toBe(6n + WELCOME_BONUS_POINTS);
    expect(await countTransfersByKey(buildWelcomeIdempotencyKey(person.personId))).toBe(1);
  });

  it('повторный прогон того же окна не задваивает бонус', async () => {
    // Окно опроса перекрывается с предыдущим по построению, и пятая поездка приезжает
    // в прогон снова и снова. Защита держится ключом `welcome:<persons.id>`, а не тем,
    // чтобы не позвать дважды.
    const person = await createTestPerson({ inProgram: true });
    const tripOrderIds = await createCompletedTrips(person, 5);

    const firstRun = await awardTripPoints(tripOrderIds);
    const secondRun = await awardTripPoints(tripOrderIds);
    const thirdRun = await awardTripPoints(tripOrderIds.slice(3));

    expect(firstRun.welcomeAwarded).toBe(1);
    expect(secondRun.welcomeAwarded).toBe(0);
    expect(thirdRun.welcomeAwarded).toBe(0);
    expect(await readAccountBalance(person.personId)).toBe(5n + WELCOME_BONUS_POINTS);
    expect(await countTransfersByKey(buildWelcomeIdempotencyKey(person.personId))).toBe(1);
  });

  it('перенесённому из старой базы не начисляется ни на пятой поездке, ни на пятидесятой', async () => {
    const legacyPerson = await createTestPerson({ inProgram: true });
    await markPersonAsLegacy(legacyPerson.personId);

    const tripOrderIds = await createCompletedTrips(legacyPerson, 12);

    const summary = await awardTripPoints(tripOrderIds);

    expect(summary.awarded).toBe(12);
    expect(summary.welcomeAwarded).toBe(0);
    // Только баллы за поездки: 300 к ним не прибавились.
    expect(await readAccountBalance(legacyPerson.personId)).toBe(12n);
    expect(await countTransfersByKey(buildWelcomeIdempotencyKey(legacyPerson.personId))).toBe(0);
  });

  it('поездки считаются на человека, а не на учётку парка', async () => {
    // Переоформленный в парке водитель — тот же человек со вторым профилем. Отсчёт
    // с нуля означал бы, что до бонуса он не дойдёт никогда.
    const person = await createTestPerson({ inProgram: true });
    const firstProfileTrips = await createCompletedTrips(person, 3);

    const secondProfile = await createTestPerson({ inProgram: true });
    await reassignProfileToPerson(secondProfile.profileId, person.personId);

    const secondProfileTrips: string[] = [];

    for (let index = 0; index < 2; index += 1) {
      const tripOrderId = `test-welcome-${person.personId}-second-${index}`;
      await createTestTrip({
        profileId: secondProfile.profileId,
        tripOrderId,
        status: 'complete',
        endedAt: COMPLETED_AT,
      });
      secondProfileTrips.push(tripOrderId);
    }

    const summary = await awardTripPoints([...firstProfileTrips, ...secondProfileTrips]);

    expect(summary.welcomeAwarded).toBe(1);
    expect(await readAccountBalance(person.personId)).toBe(5n + WELCOME_BONUS_POINTS);
  });

  it('поездки до вступления в программу в счёт не идут', async () => {
    // Поездки пишутся для всего реестра парка независимо от участия. Водитель, отъездивший
    // в парке три месяца и зарегистрировавшийся вчера, иначе получил бы 300 баллов
    // в первом же прогоне — за поездки, сделанные до всякой программы.
    const joinedAt = new Date('2026-09-09T00:00:00.000Z');
    const person = await createTestPerson({ inProgram: true, joinedAt });

    const beforeJoining: string[] = [];

    for (let index = 0; index < 8; index += 1) {
      const tripOrderId = `test-welcome-${person.personId}-before-${index}`;
      await createTestTrip({
        profileId: person.profileId,
        tripOrderId,
        status: 'complete',
        endedAt: new Date('2026-08-20T12:00:00.000Z'),
      });
      beforeJoining.push(tripOrderId);
    }

    const beforeJoiningRun = await awardTripPoints(beforeJoining);

    // Баллы за поездки начисляются — участие проверяется на момент прогона, а не поездки.
    // Бонус не выдаётся: до вступления этих поездок для него не существует.
    expect(beforeJoiningRun.awarded).toBe(8);
    expect(beforeJoiningRun.welcomeAwarded).toBe(0);
    expect(await readAccountBalance(person.personId)).toBe(8n);

    // Четыре поездки после вступления — порог всё ещё не сошёлся.
    const afterJoining = await createCompletedTrips(person, 4);
    const beforeThreshold = await awardTripPoints(afterJoining);

    expect(beforeThreshold.welcomeAwarded).toBe(0);
    expect(await readAccountBalance(person.personId)).toBe(12n);

    const fifthTripOrderId = `test-welcome-${person.personId}-after-fifth`;
    await createTestTrip({
      profileId: person.profileId,
      tripOrderId: fifthTripOrderId,
      status: 'complete',
      endedAt: COMPLETED_AT,
    });

    const atThreshold = await awardTripPoints([fifthTripOrderId]);

    expect(atThreshold.welcomeAwarded).toBe(1);
    expect(await readAccountBalance(person.personId)).toBe(13n + WELCOME_BONUS_POINTS);
    expect(await countTransfersByKey(buildWelcomeIdempotencyKey(person.personId))).toBe(1);
  });

  it('незавершённые поездки в счёт не идут', async () => {
    const person = await createTestPerson({ inProgram: true });
    const tripOrderIds = await createCompletedTrips(person, 5);
    const lastTripOrderId = tripOrderIds[4]!;

    await setTripStatus(lastTripOrderId, 'driving', null);

    const beforeCompletion = await awardTripPoints(tripOrderIds);

    expect(beforeCompletion.welcomeAwarded).toBe(0);
    expect(await readAccountBalance(person.personId)).toBe(4n);

    // Поездка вернётся в следующем окне завершённой — бонус выдастся тогда.
    await setTripStatus(lastTripOrderId, 'complete', COMPLETED_AT);

    const afterCompletion = await awardTripPoints(tripOrderIds);

    expect(afterCompletion.welcomeAwarded).toBe(1);
    expect(await readAccountBalance(person.personId)).toBe(5n + WELCOME_BONUS_POINTS);
  });

  it('человеку вне программы не начисляется ни балла, ни бонуса', async () => {
    const outsider = await createTestPerson({ inProgram: false });
    const tripOrderIds = await createCompletedTrips(outsider, 7);

    const summary = await awardTripPoints(tripOrderIds);

    expect(summary.outsideProgram).toBe(7);
    expect(summary.welcomeAwarded).toBe(0);
    expect(await readAccountBalance(outsider.personId)).toBe(0n);
  });
});
