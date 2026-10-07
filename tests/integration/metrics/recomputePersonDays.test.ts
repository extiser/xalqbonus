import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '#server/db';
import { recomputePersonDays } from '#server/services/metrics/recomputePersonDays';
import { readMonthMultipliers } from '#server/services/metrics/readMonthMultipliers';
import { shiftDayKey } from '#server/utils/parkTime';
import {
  cleanupTestData,
  createTestPerson,
  createTestTrip,
  disconnectDatabase,
  reassignProfileToPerson,
  type TestPerson,
} from '../support/database';
import {
  cleanupTestMetrics,
  countMetricPersonDays,
  insertTestHistoryOrder,
  insertTestTransaction,
  readTestPersonDays,
  readTestPersonPrior,
  upsertTestHistoryDay,
} from '../support/metrics';

/**
 * Пересчёт таблицы метрик и множители месяца против настоящей базы (issue #371).
 *
 * Ряд поездок — один сырой запрос над двумя таблицами (`server/repositories/metrics.ts`),
 * итоги месяца — второй. Миграция любой из таблиц сломает их молча: типы расхождения
 * со схемой не ловят (docs/infra.md → «Тесты», третье исключение). Тест гоняет их через
 * сервисы, которыми их зовут очередь и ручка.
 *
 * Собранный месяц — ноябрь 2025: внутри окна метрик и далеко от поездок остальных тестов.
 *
 * Поездки до истории заказов (issue #429) — комиссии `partner_ride_fee` раньше 2025-10-01
 * по Ташкенту, тем же прогоном.
 */

/** «Сейчас» пересчёта: окно метрик — по 2026-10-04 включительно. */
const NOW = new Date('2026-10-05T12:00:00Z');

const MONTH = '2025-11';

const UNKNOWN_PROFILE_ID = 'test-metrics-unknown-profile';

const HISTORY_ORDER_IDS = [
  'test-metrics-both',
  'test-metrics-history-no-end',
  'test-metrics-second-profile-1',
  'test-metrics-second-profile-2',
  'test-metrics-unattributed',
  'test-metrics-unattributed-cancelled',
];

/** Порции сбора под покрытие ноября: с 31 октября по 30 ноября, последняя не закрыта. */
const HISTORY_DAYS: string[] = [];

for (let day = '2025-10-31'; day <= '2025-11-30'; day = shiftDayKey(day, 1)) {
  HISTORY_DAYS.push(day);
}

let twoProfiles: TestPerson;
let secondProfileId: string;
let single: TestPerson;
let demo: TestPerson;
let early: TestPerson;

const personIds = (): string[] => [twoProfiles.personId, single.personId, demo.personId];

describe('пересчёт таблицы метрик', () => {
  let baselineUnattributed = 0;

  beforeAll(async () => {
    // Прежние незакреплённые заказы истории в базе тестов есть или нет — отсчёт от них.
    baselineUnattributed = (await recomputePersonDays(NOW)).unattributedOrders;

    twoProfiles = await createTestPerson({ inProgram: false });
    single = await createTestPerson({ inProgram: false });
    demo = await createTestPerson({ inProgram: false });
    await db.person.update({ where: { id: demo.personId }, data: { isDemo: true } });

    // Второй профиль того же человека — так выглядит склейка двойных учётных записей.
    const donor = await createTestPerson({ inProgram: false });
    secondProfileId = donor.profileId;
    await reassignProfileToPerson(secondProfileId, twoProfiles.personId);

    // Заказ в обеих таблицах: в истории отменён, у другого профиля и в другие сутки,
    // в `trips` — завершён. Берётся строка `trips` целиком.
    await insertTestHistoryOrder({
      orderId: 'test-metrics-both',
      profileId: twoProfiles.profileId,
      status: 'cancelled',
      endedAt: new Date('2025-11-11T08:00:00Z'),
    });
    await createTestTrip({
      profileId: single.profileId,
      tripOrderId: 'test-metrics-both',
      status: 'complete',
      endedAt: new Date('2025-11-10T08:00:00Z'),
    });

    // Незавершённый и завершённый без времени окончания поездкой не считаются.
    await createTestTrip({
      profileId: single.profileId,
      tripOrderId: 'test-metrics-cancelled',
      status: 'cancelled',
      endedAt: new Date('2025-11-12T08:00:00Z'),
    });
    await createTestTrip({
      profileId: single.profileId,
      tripOrderId: 'test-metrics-no-end',
      status: 'complete',
      endedAt: null,
    });
    await insertTestHistoryOrder({
      orderId: 'test-metrics-history-no-end',
      profileId: single.profileId,
      status: 'complete',
      endedAt: null,
    });

    // 19:30Z последнего дня сентября — 00:30 первого октября по Ташкенту.
    await createTestTrip({
      profileId: single.profileId,
      tripOrderId: 'test-metrics-tashkent-midnight',
      status: 'complete',
      endedAt: new Date('2026-09-30T19:30:00Z'),
    });

    // Человек с двумя профилями: одна поездка в `trips` первым профилем, две в истории вторым.
    await createTestTrip({
      profileId: twoProfiles.profileId,
      tripOrderId: 'test-metrics-first-profile',
      status: 'complete',
      endedAt: new Date('2025-11-15T06:00:00Z'),
    });
    await insertTestHistoryOrder({
      orderId: 'test-metrics-second-profile-1',
      profileId: secondProfileId,
      status: 'complete',
      endedAt: new Date('2025-11-15T10:00:00Z'),
    });
    await insertTestHistoryOrder({
      orderId: 'test-metrics-second-profile-2',
      profileId: secondProfileId,
      status: 'complete',
      endedAt: new Date('2025-11-15T11:00:00Z'),
    });

    // Демо-человек не входит никуда.
    await createTestTrip({
      profileId: demo.profileId,
      tripOrderId: 'test-metrics-demo',
      status: 'complete',
      endedAt: new Date('2025-11-15T06:00:00Z'),
    });

    // Профиля нет в реестре: завершённый — в `unattributed_orders`, отменённый — никуда.
    await insertTestHistoryOrder({
      orderId: 'test-metrics-unattributed',
      profileId: UNKNOWN_PROFILE_ID,
      status: 'complete',
      endedAt: new Date('2025-11-20T08:00:00Z'),
    });
    await insertTestHistoryOrder({
      orderId: 'test-metrics-unattributed-cancelled',
      profileId: UNKNOWN_PROFILE_ID,
      status: 'cancelled',
      endedAt: new Date('2025-11-20T09:00:00Z'),
    });

    // Поездки до истории заказов. 20:00Z 31 августа — 01:00 первого сентября по Ташкенту;
    // выплата наличных — не комиссия и последние сутки не сдвигает.
    early = await createTestPerson({ inProgram: false });
    await insertTestTransaction(early.profileId, 'partner_ride_fee', new Date('2025-06-10T08:00:00Z'));
    await insertTestTransaction(early.profileId, 'partner_ride_fee', new Date('2025-08-31T20:00:00Z'));
    await insertTestTransaction(early.profileId, 'cash_collected', new Date('2025-09-20T08:00:00Z'));

    // Вторым профилем, 18:30Z 30 сентября — 23:30 по Ташкенту, ещё до истории.
    await insertTestTransaction(secondProfileId, 'partner_ride_fee', new Date('2025-09-30T18:30:00Z'));

    // 19:30Z 30 сентября — 00:30 первого октября по Ташкенту: уже история, строки не даёт.
    await insertTestTransaction(single.profileId, 'partner_ride_fee', new Date('2025-09-30T19:30:00Z'));

    // Демо и профиль вне реестра не дают строки.
    await insertTestTransaction(demo.profileId, 'partner_ride_fee', new Date('2025-05-01T08:00:00Z'));
    await insertTestTransaction(UNKNOWN_PROFILE_ID, 'partner_ride_fee', new Date('2025-05-01T08:00:00Z'));
    await insertTestTransaction(null, 'partner_ride_fee', new Date('2025-05-01T08:00:00Z'));

    for (const day of HISTORY_DAYS) {
      await upsertTestHistoryDay(day, day !== '2025-11-30');
    }
  });

  afterAll(async () => {
    await cleanupTestMetrics(HISTORY_ORDER_IDS, HISTORY_DAYS);
    await cleanupTestData();
    await disconnectDatabase();
  });

  it('склеивает две таблицы, режет сутки по Ташкенту и складывает профили человека', async () => {
    const summary = await recomputePersonDays(NOW);

    expect(summary.daysFrom).toBe('2025-10-01');
    expect(summary.daysTo).toBe('2026-10-04');

    // Незавершённых, без времени окончания и демо здесь нет ни одной строкой.
    expect(await readTestPersonDays(personIds())).toEqual([
      // Заказ из обеих таблиц — по строке `trips`: её профиль и её сутки, поездка одна.
      { day: '2025-11-10', personId: single.personId, trips: 1 },
      // Два профиля — одна строка с суммой поездок обоих.
      { day: '2025-11-15', personId: twoProfiles.personId, trips: 3 },
      { day: '2026-10-01', personId: single.personId, trips: 1 },
    ]);
  });

  it('поездки до истории — последние сутки комиссии по Ташкенту, по человеку, без демо', async () => {
    await recomputePersonDays(NOW);

    const expected = [
      { personId: early.personId, lastDay: '2025-09-01' },
      { personId: twoProfiles.personId, lastDay: '2025-09-30' },
    ].sort((left, right) => (left.personId < right.personId ? -1 : 1));

    expect(await readTestPersonPrior([...personIds(), early.personId])).toEqual(expected);

    // Повторный пересчёт таблицу не удваивает.
    await recomputePersonDays(NOW);
    expect(await readTestPersonPrior([...personIds(), early.personId])).toEqual(expected);
  });

  it('заказ истории без профиля в реестре — в unattributed_orders, а не в таблице', async () => {
    const summary = await recomputePersonDays(NOW);

    expect(summary.unattributedOrders - baselineUnattributed).toBe(1);

    const run = await db.metricRecomputeRun.findUnique({ where: { id: summary.runId } });

    expect(run?.finishedAt).not.toBeNull();
    expect(run?.error).toBeNull();
    expect(run?.rows).toBe(summary.rows);
    expect(run?.unattributedOrders).toBe(summary.unattributedOrders);
  });

  it('повторный пересчёт даёт ту же таблицу, а не вдвое больше строк', async () => {
    const first = await recomputePersonDays(NOW);
    const firstRows = await readTestPersonDays(personIds());
    const second = await recomputePersonDays(NOW);

    expect(second.rows).toBe(first.rows);
    expect(await countMetricPersonDays()).toBe(second.rows);
    expect(await readTestPersonDays(personIds())).toEqual(firstRows);
  });

  it('множители собранного месяца сходятся: D × N × P = T', async () => {
    await recomputePersonDays(NOW);
    const month = await readMonthMultipliers(MONTH, NOW);

    expect(month.current).toEqual({ trips: 4, driversOnLine: 2, daysOnLine: 1, tripsPerDay: 2 });
    expect(month.current.driversOnLine * month.current.daysOnLine * month.current.tripsPerDay).toBeCloseTo(
      month.current.trips,
      9,
    );
    // В октябре 2025 поездок у тестов нет — сравнивать не с чем.
    expect(month.base).toBeNull();
  });

  it('покрытие суток — по закрытым и незакрытым порциям сбора истории', async () => {
    const month = await readMonthMultipliers(MONTH, NOW);

    // 30 ноября ложится в порции 29 и 30 ноября, а 30-я не закрыта.
    expect(month.period).toEqual({
      from: '2025-11-01',
      to: '2025-11-30',
      days: 30,
      coveredDays: 29,
      partial: false,
    });
    // 31 октября ложится в порции 30 и 31 октября, а 30-й нет вовсе.
    expect(month.basePeriod).toEqual({
      from: '2025-10-01',
      to: '2025-10-31',
      days: 31,
      coveredDays: 0,
      partial: false,
    });
  });
});
