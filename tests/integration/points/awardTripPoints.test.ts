import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { awardTripPoints } from '#server/services/points/awardTripPoints';
import { buildTripIdempotencyKey } from '#server/services/points/idempotencyKey';
import {
  cleanupTestData,
  countTransfersByKey,
  createTestPerson,
  createTestTrip,
  disconnectDatabase,
  readAccountBalance,
  setTripStatus,
  type TestPerson,
} from '../support/database';

const COMPLETED_AT = new Date('2026-08-20T12:00:00.000Z');

/** Заводит человеку пачку завершённых поездок и возвращает их идентификаторы заказов. */
const createCompletedTrips = async (person: TestPerson, count: number): Promise<string[]> => {
  const tripOrderIds: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const tripOrderId = `test-trip-${person.personId}-${index}`;
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

describe('начисление за завершённые поездки', () => {
  afterEach(cleanupTestData);
  afterAll(disconnectDatabase);

  it('начисляет по баллу за завершённую поездку', async () => {
    const person = await createTestPerson({ inProgram: true });
    const tripOrderIds = await createCompletedTrips(person, 3);

    const summary = await awardTripPoints(tripOrderIds);

    expect(summary.awarded).toBe(3);
    expect(summary.alreadyAwarded).toBe(0);
    expect(await readAccountBalance(person.personId)).toBe(3n);
  });

  it('перекрывающиеся окна дают тот же баланс, что один прогон', async () => {
    // То самое, ради чего вся идемпотентность: окно опроса Fleet API строится по времени
    // завершения и намеренно перекрывается с предыдущим, иначе поездки теряются
    // (docs/analysis.md). Перекрытие обязано быть безопасным.
    const person = await createTestPerson({ inProgram: true });
    const tripOrderIds = await createCompletedTrips(person, 5);

    const firstWindow = tripOrderIds.slice(0, 3);
    const secondWindow = tripOrderIds.slice(2);

    const firstRun = await awardTripPoints(firstWindow);
    const secondRun = await awardTripPoints(secondWindow);

    expect(firstRun.awarded).toBe(3);
    expect(secondRun.awarded).toBe(2);
    // Пересечение из одной поездки опознано как повтор, а не начислено второй раз.
    expect(secondRun.alreadyAwarded).toBe(1);
    expect(await readAccountBalance(person.personId)).toBe(5n);

    // Третий прогон по всему набору сразу не меняет ничего.
    const thirdRun = await awardTripPoints(tripOrderIds);

    expect(thirdRun.awarded).toBe(0);
    expect(thirdRun.alreadyAwarded).toBe(5);
    expect(await readAccountBalance(person.personId)).toBe(5n);
  });

  it('поездка в промежуточном статусе не начисляется, а после завершения — ровно раз', async () => {
    const person = await createTestPerson({ inProgram: true });
    const tripOrderId = `test-trip-${person.personId}-driving`;

    await createTestTrip({
      profileId: person.profileId,
      tripOrderId,
      status: 'driving',
      endedAt: null,
    });

    const beforeCompletion = await awardTripPoints([tripOrderId]);

    expect(beforeCompletion.awarded).toBe(0);
    expect(beforeCompletion.notCompleted).toBe(1);
    expect(await readAccountBalance(person.personId)).toBe(0n);

    // Поездка вернётся в следующем окне уже завершённой — и начислится тогда.
    await setTripStatus(tripOrderId, 'complete', COMPLETED_AT);

    const afterCompletion = await awardTripPoints([tripOrderId]);
    const repeatedRun = await awardTripPoints([tripOrderId]);

    expect(afterCompletion.awarded).toBe(1);
    expect(repeatedRun.awarded).toBe(0);
    expect(repeatedRun.alreadyAwarded).toBe(1);
    expect(await countTransfersByKey(buildTripIdempotencyKey(tripOrderId))).toBe(1);
    expect(await readAccountBalance(person.personId)).toBe(1n);
  });

  it('завершённая поездка без времени завершения откладывается, а не начисляется', async () => {
    const person = await createTestPerson({ inProgram: true });
    const tripOrderId = `test-trip-${person.personId}-no-ended-at`;

    await createTestTrip({
      profileId: person.profileId,
      tripOrderId,
      status: 'complete',
      endedAt: null,
    });

    const summary = await awardTripPoints([tripOrderId]);

    expect(summary.awarded).toBe(0);
    expect(summary.withoutEndedAt).toBe(1);
    expect(await readAccountBalance(person.personId)).toBe(0n);
  });

  it('поездка человека вне программы не начисляется и не роняет прогон', async () => {
    // Реестр парка шире программы: у человека может не быть строки person_settings.
    // Это норма, а не ошибка (docs/drivers.md).
    const outsider = await createTestPerson({ inProgram: false });
    const participant = await createTestPerson({ inProgram: true });

    const outsiderTrips = await createCompletedTrips(outsider, 2);
    const participantTrips = await createCompletedTrips(participant, 1);

    const summary = await awardTripPoints([...outsiderTrips, ...participantTrips]);

    expect(summary.outsideProgram).toBe(2);
    expect(summary.awarded).toBe(1);
    expect(await readAccountBalance(outsider.personId)).toBe(0n);
    expect(await readAccountBalance(participant.personId)).toBe(1n);
  });

  it('неизвестный идентификатор заказа попадает в сводку и не роняет прогон', async () => {
    const person = await createTestPerson({ inProgram: true });
    const [tripOrderId] = await createCompletedTrips(person, 1);

    const summary = await awardTripPoints([tripOrderId!, 'test-trip-not-in-database']);

    expect(summary.unknownTrip).toBe(1);
    expect(summary.awarded).toBe(1);
  });

  it('повторы на входе считаются один раз', async () => {
    const person = await createTestPerson({ inProgram: true });
    const [tripOrderId] = await createCompletedTrips(person, 1);

    const summary = await awardTripPoints([tripOrderId!, tripOrderId!, tripOrderId!]);

    expect(summary.requested).toBe(1);
    expect(summary.awarded).toBe(1);
    expect(summary.unknownTrip).toBe(0);
    expect(await readAccountBalance(person.personId)).toBe(1n);
  });
});
