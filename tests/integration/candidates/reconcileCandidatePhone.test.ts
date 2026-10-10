import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { reconcileCandidatePhone } from '#server/services/candidates/reconcileCandidatePhone';
import { cleanupTestData, createTestPerson, createTestTrip, disconnectDatabase } from '../support/database';
import { cleanupTestEmployees, nextTestPhone, setTestProfilePhone } from '../support/employees';
import { cleanupTestMetrics, insertTestPersonDays, insertTestPersonPrior, markTestPersonDemo } from '../support/metrics';

/**
 * Сверка номера заявки кандидата (issue #456) — сырой запрос `findPersonLastTripDay`, третье
 * исключение docs/infra.md → «Тесты»: последние сутки с поездкой собираются из трёх таблиц,
 * и расхождение со схемой любой из них typecheck не поймает. Прогоняется через сервис, которым
 * его читает ручка заявки.
 *
 * Номер у каждого человека свой и в реестре есть: до Fleet API сверка не доходит.
 */

/** 10-10-2026, полдень по Ташкенту. */
const NOW = new Date('2026-10-10T07:00:00.000Z');

let tripNumber = 0;

const nextTripOrderId = (): string => {
  tripNumber += 1;

  return `test-candidate-trip-${Date.now()}-${tripNumber}`;
};

/** Человек с профилем и этим номером в реестре. */
const createPersonWithPhone = async (): Promise<{ personId: string; profileId: string; phone: string }> => {
  const person = await createTestPerson({ inProgram: false });
  const phone = nextTestPhone();

  await setTestProfilePhone(person.profileId, phone);

  return { ...person, phone };
};

describe('сверка номера заявки кандидата', () => {
  afterAll(async () => {
    await disconnectDatabase();
  });

  afterEach(async () => {
    await cleanupTestMetrics([], []);
    await cleanupTestData();
    await cleanupTestEmployees();
  });

  it('поездка только в `trips` — сегодняшняя, по Ташкенту: работает', async () => {
    const person = await createPersonWithPhone();

    // 23:30 по Ташкенту 9-го — по UTC это ещё 9-е, а позже полуночи было бы уже 10-е.
    await createTestTrip({
      profileId: person.profileId,
      tripOrderId: nextTripOrderId(),
      status: 'complete',
      endedAt: new Date('2026-10-09T18:30:00.000Z'),
    });
    // Отменённая позже — не поездка.
    await createTestTrip({
      profileId: person.profileId,
      tripOrderId: nextTripOrderId(),
      status: 'cancelled',
      endedAt: new Date('2026-10-10T05:00:00.000Z'),
    });

    expect(await reconcileCandidatePhone(person.phone, NOW)).toEqual({
      match: 'working',
      personId: person.personId,
      profileId: person.profileId,
      lastTripDay: '2026-10-09',
    });
  });

  it('поездка только в `metric_person_days`: последние сутки оттуда', async () => {
    const person = await createPersonWithPhone();

    await insertTestPersonDays([
      { day: '2026-07-01', personId: person.personId, trips: 3 },
      { day: '2026-07-12', personId: person.personId, trips: 1 },
    ]);

    // До 10-10 — 90 суток: ещё работает.
    expect(await reconcileCandidatePhone(person.phone, NOW)).toMatchObject({
      match: 'working',
      lastTripDay: '2026-07-12',
    });
  });

  it('поездка только в `metric_person_prior`, давно: работал раньше', async () => {
    const person = await createPersonWithPhone();

    await insertTestPersonPrior([{ personId: person.personId, lastDay: '2025-09-30' }]);

    expect(await reconcileCandidatePhone(person.phone, NOW)).toEqual({
      match: 'former',
      personId: person.personId,
      profileId: person.profileId,
      lastTripDay: '2025-09-30',
    });
  });

  it('91 сутки без поездок — уже работал раньше', async () => {
    const person = await createPersonWithPhone();

    await insertTestPersonDays([{ day: '2026-07-11', personId: person.personId, trips: 2 }]);

    expect(await reconcileCandidatePhone(person.phone, NOW)).toMatchObject({
      match: 'former',
      lastTripDay: '2026-07-11',
    });
  });

  it('без поездок — профиль есть, поездок нет', async () => {
    const person = await createPersonWithPhone();

    expect(await reconcileCandidatePhone(person.phone, NOW)).toEqual({
      match: 'no_trips',
      personId: person.personId,
      profileId: person.profileId,
      lastTripDay: null,
    });
  });

  it('демо-человек — поездок нет, как бы их ни было', async () => {
    const person = await createPersonWithPhone();

    await markTestPersonDemo(person.personId);
    await insertTestPersonDays([{ day: '2026-10-09', personId: person.personId, trips: 5 }]);

    expect(await reconcileCandidatePhone(person.phone, NOW)).toMatchObject({
      match: 'no_trips',
      lastTripDay: null,
    });
  });
});
