import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { reconcileCandidatePhone } from '#server/services/candidates/reconcileCandidatePhone';
import { type ProfileLookupSummary, runProfileSyncByPhone } from '#server/services/sync/syncProfileByPhone';
import { CANDIDATE_LOOKUP_BUDGET_MS } from '#shared/candidateApplications';
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

// Поиск в Fleet API подменяется: тест проверяет срок сверки, а не Fleet. Сверки с номером
// из реестра до поиска не доходят, и подмена их не касается.
vi.mock('#server/services/sync/syncProfileByPhone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#server/services/sync/syncProfileByPhone')>()),
  runProfileSyncByPhone: vi.fn(),
}));

/** Насколько ответ сверки может опоздать против срока: таймер и запрос к реестру. */
const BUDGET_SLACK_MS = 1_000;

/** Насколько поддельный поиск дольше срока. */
const LOOKUP_OVERRUN_MS = 500;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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

  describe('поиск в Fleet API дольше срока сверки', () => {
    afterEach(() => {
      vi.mocked(runProfileSyncByPhone).mockReset();
    });

    it('ответил после срока — заявка без сверки, ответ не позже срока', async () => {
      const summary: ProfileLookupSummary = {
        runId: 'test',
        requests: 1,
        rateLimited: 0,
        profilesSeen: 0,
        profilesInserted: 0,
        profilesUpdated: 0,
        skippedWithoutLicense: 0,
        malformed: 0,
      };
      const lookup = delay(CANDIDATE_LOOKUP_BUDGET_MS + LOOKUP_OVERRUN_MS).then(() => summary);

      vi.mocked(runProfileSyncByPhone).mockReturnValue(lookup);

      const startedAt = Date.now();
      const reconciliation = await reconcileCandidatePhone(nextTestPhone(), NOW);
      const elapsedMs = Date.now() - startedAt;

      expect(reconciliation).toEqual({ match: 'lookup_failed', personId: null, profileId: null, lastTripDay: null });
      expect(elapsedMs).toBeGreaterThanOrEqual(CANDIDATE_LOOKUP_BUDGET_MS - 50);
      expect(elapsedMs).toBeLessThan(CANDIDATE_LOOKUP_BUDGET_MS + BUDGET_SLACK_MS);

      // Поиск не оборван: доделывается в фоне.
      await expect(lookup).resolves.toBe(summary);
    });

    it('упал после срока — заявка без сверки, отказ поиска не уходит наружу', async () => {
      const lookup = delay(CANDIDATE_LOOKUP_BUDGET_MS + LOOKUP_OVERRUN_MS).then((): ProfileLookupSummary => {
        throw new Error('fetch failed');
      });

      vi.mocked(runProfileSyncByPhone).mockReturnValue(lookup);

      expect(await reconcileCandidatePhone(nextTestPhone(), NOW)).toMatchObject({ match: 'lookup_failed' });

      // Отказ случается уже после ответа: необработанное отклонение Vitest засчитал бы провалом.
      await delay(LOOKUP_OVERRUN_MS + 200);
    });
  });
});
