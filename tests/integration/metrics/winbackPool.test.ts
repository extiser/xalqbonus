import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { listWinbackExport, winbackFileName } from '#server/services/metrics/listWinbackExport';
import { readWinbackPool, winbackSnapshots } from '#server/services/metrics/readWinbackPool';
import { shiftDayKey } from '#server/utils/parkTime';
import type { DashboardWinbackPool } from '#shared/types/dashboard';
import type { ReportCell } from '#shared/types/reports';
import { cleanupTestData, createTestPerson, createTestTrip, disconnectDatabase, type TestPerson } from '../support/database';
import {
  addTestProfilePhone,
  cleanupTestLinks,
  cleanupTestMetrics,
  cleanupTestMoney,
  closeTestHistoryDays,
  insertTestMoneyRun,
  insertTestPersonDays,
  insertTestPersonMonths,
  insertTestPersonPrior,
  linkTestPersonAt,
  markTestPersonDemo,
  setTestProfileCard,
  upsertTestHistoryDay,
  type TestPersonDay,
  type TestPersonMonth,
} from '../support/metrics';

/**
 * «Можно вернуть» против настоящей базы (issue #446).
 *
 * Последнюю поездку, поездки с апреля 2024 и самовозврат по снимкам считают сырые запросы
 * над `metric_person_days`, `metric_person_prior` и `metric_person_months` — третье исключение
 * правила тестов (docs/infra.md → «Тесты»). Таблицы производные: фикстура пишется в них напрямую,
 * перед сценарием они стираются. Пул — сервисом ручки «Глубины», выгрузка — сервисом своей ручки.
 *
 * День отсчёта — 30.09.2026, закрытый сентябрь. Сутки поездок от начала истории покрыты закрытыми
 * порциями сбора истории до `TRIPS_COMPLETE_FROM`, дальше — живой синхронизацией.
 */

const HISTORY_FROM = '2025-09-30';
const HISTORY_TO = '2026-09-20';
const AS_OF = '2026-09-30';
const NOW = new Date('2026-10-15T07:00:00Z');

/** Последняя поездка за `idle` суток до дня отсчёта. */
const idleDay = (idle: number): string => shiftDayKey(AS_OF, -idle);

const monthRow = (person: TestPerson, month: string, orders: number): TestPersonMonth => ({
  month,
  personId: person.personId,
  orders,
  fee: '0',
  payment: '0',
  feeNewcomerRate: '0',
  paymentNewcomerRate: '0',
});

describe('снимки самовозврата', () => {
  it('первые числа месяцев с ноября 2025, чьё окно прошло, — последние 12', () => {
    expect(winbackSnapshots('2025-11-29')).toEqual([]);
    expect(winbackSnapshots('2025-11-30')).toEqual(['2025-11-01']);
    expect(winbackSnapshots('2026-12-31')).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
      '2026-05-01',
      '2026-06-01',
      '2026-07-01',
      '2026-08-01',
      '2026-09-01',
      '2026-10-01',
      '2026-11-01',
      '2026-12-01',
    ]);
  });
});

/**
 * Люди фикстуры полос — последняя поездка за столько суток до 30.09.2026:
 *
 * - `idle29` — 29: ещё не ушёл
 * - `idle30` — 30: 1–3 месяца; 60 поездок в мае 2024 и 40 в сентябре 2026 — ровно 100, ездил много;
 *   500 в октябре 2026 — после месяца отсчёта и не в счёт. Карточка, телефон и привязка — для выгрузки
 * - `idle89` — 89: 1–3 месяца; 99 поездок, сотая — в октябре 2026 и не в счёт
 * - `idle90` — 90: 3–6 месяцев, 150 поездок
 * - `idle179` — 179: 3–6 месяцев, строк денег нет — ноль поездок
 * - `idle180` — 180: 6–12 месяцев, 120 поездок
 * - `junction` — до истории последние сутки 30.09.2025, в таблице 01.10.2025: последняя поездка —
 *   из таблицы, 364 суток, 6–12 месяцев; 10 поездок
 * - `priorOnly` — только до истории, 30.09.2025: 365 суток, больше года; 30 поездок
 * - `priorOld` — только до истории, 01.06.2024: больше года; 50 поездок
 * - `afterAsOf` — 01.08.2026 и 05.10.2026: последняя поездка на день отсчёта — 01.08, 60 суток
 * - `demo` — как `idle30`, но демо: не входит никуда
 */
describe('полосы на день отсчёта и выгрузка', () => {
  type Name =
    | 'idle29'
    | 'idle30'
    | 'idle89'
    | 'idle90'
    | 'idle179'
    | 'idle180'
    | 'junction'
    | 'priorOnly'
    | 'priorOld'
    | 'afterAsOf'
    | 'demo';

  const people = {} as Record<Name, TestPerson>;
  let historyDays: string[] = [];
  let pool: DashboardWinbackPool;

  beforeAll(async () => {
    await cleanupTestMoney([]);
    await cleanupTestMetrics([], []);
    historyDays = await closeTestHistoryDays(HISTORY_FROM, HISTORY_TO);

    const names: Name[] = [
      'idle29',
      'idle30',
      'idle89',
      'idle90',
      'idle179',
      'idle180',
      'junction',
      'priorOnly',
      'priorOld',
      'afterAsOf',
      'demo',
    ];

    for (const name of names) {
      people[name] = await createTestPerson({ inProgram: false });
    }

    const day = (name: Name, value: string): TestPersonDay => ({ day: value, personId: people[name].personId, trips: 3 });

    await insertTestPersonDays([
      day('idle29', idleDay(29)),
      day('idle30', idleDay(40)),
      day('idle30', idleDay(30)),
      day('idle89', idleDay(89)),
      day('idle90', idleDay(90)),
      day('idle179', idleDay(179)),
      day('idle180', idleDay(180)),
      day('junction', '2025-10-01'),
      day('afterAsOf', '2026-08-01'),
      day('afterAsOf', '2026-10-05'),
      day('demo', idleDay(30)),
    ]);
    await insertTestPersonPrior([
      { personId: people.junction.personId, lastDay: '2025-09-30' },
      { personId: people.priorOnly.personId, lastDay: '2025-09-30' },
      { personId: people.priorOld.personId, lastDay: '2024-06-01' },
    ]);
    await insertTestPersonMonths([
      monthRow(people.idle30, '2024-05-01', 60),
      monthRow(people.idle30, '2026-09-01', 40),
      monthRow(people.idle30, '2026-10-01', 500),
      monthRow(people.idle89, '2026-07-01', 99),
      monthRow(people.idle89, '2026-10-01', 1),
      monthRow(people.idle90, '2026-06-01', 150),
      monthRow(people.idle180, '2026-03-01', 120),
      monthRow(people.junction, '2025-10-01', 10),
      monthRow(people.priorOnly, '2025-09-01', 30),
      monthRow(people.priorOld, '2024-06-01', 50),
      monthRow(people.demo, '2026-08-01', 200),
    ]);
    await markTestPersonDemo(people.demo.personId);

    // Карточка `idle30`: позывной и ФИО — профиля последней поездки, программа — открытая привязка.
    await setTestProfileCard(people.idle30.profileId, {
      callsign: 'T446-1',
      firstName: 'Азиз',
      lastName: 'Каримов',
      middleName: 'Бахтиёрович',
    });
    await createTestTrip({
      profileId: people.idle30.profileId,
      tripOrderId: `test-winback-${randomUUID()}`,
      status: 'complete',
      endedAt: new Date(`${idleDay(30)}T06:00:00Z`),
    });
    await addTestProfilePhone(people.idle30.profileId, { phoneRaw: '+998901114461', phoneE164: '+998901114461' });
    await linkTestPersonAt(people.idle30.personId, new Date('2026-01-01T00:00:00Z'));
  });

  afterAll(async () => {
    await cleanupTestLinks();
    await cleanupTestMoney([]);
    await cleanupTestMetrics([], historyDays);
    await cleanupTestData();
  });

  it('прогона денег не было — цифр нет', async () => {
    const empty = await readWinbackPool('2026-09', NOW);

    expect(empty.asOfDay).toBe(AS_OF);
    expect(empty.computedAt).toBeNull();
    expect(empty.leftYear).toBeNull();
    expect(empty.bands.map((band) => band.people)).toEqual([null, null, null, null]);
    await expect(listWinbackExport('2026-09', NOW)).rejects.toThrow('пересчёта денег ещё не было');
  });

  describe('прогон денег есть', () => {
    beforeAll(async () => {
      await insertTestMoneyRun('2026-10-14', new Date('2026-10-15T01:00:00Z'));
      pool = await readWinbackPool('2026-09', NOW);
    });

    it('полосы по суткам от последней поездки: 29 / 30, 89 / 90, 179 / 180, 364 / 365', () => {
      expect(pool.bands.map(({ key, people: count, many }) => ({ key, count, many }))).toEqual([
        { key: 'months1to3', count: 3, many: 1 },
        { key: 'months3to6', count: 2, many: 1 },
        { key: 'months6to12', count: 2, many: 1 },
        { key: 'overYear', count: 2, many: 0 },
      ]);
    });

    it('ушли за год — три полосы вместе; медиана «больше года» — по поездкам с апреля 2024', () => {
      expect(pool.leftYear).toBe(7);
      expect(pool.leftYearMany).toBe(3);
      expect(pool.overYearMedianRides).toBe(40);
    });

    it('выгрузка — сначала 100+, внутри — от недавно ушедших; демо и «больше года» не входят', async () => {
      const report = await listWinbackExport('2026-09', NOW);
      const rows = report.sections[0]?.rows ?? [];
      const cells = (key: string): ReportCell[] => rows.map((row) => row.cells[key] ?? null);

      expect(cells('idleDays')).toEqual([30, 90, 180, 60, 89, 179, 364]);
      expect(cells('rides')).toEqual([100, 150, 120, 0, 99, 0, 10]);
      expect(cells('band')).toEqual([
        '1–3 месяца',
        '3–6 месяцев',
        '6–12 месяцев',
        '1–3 месяца',
        '1–3 месяца',
        '3–6 месяцев',
        '6–12 месяцев',
      ]);
      expect(rows.length).toBe(pool.leftYear);
      expect(rows[0]?.cells).toEqual({
        callsign: 'T446-1',
        lastName: 'Каримов',
        firstName: 'Азиз',
        middleName: 'Бахтиёрович',
        phones: '+998901114461',
        inProgram: 'да',
        idleDays: 30,
        lastTripDay: '31.08.2026',
        band: '1–3 месяца',
        rides: 100,
      });
      expect(rows[6]?.cells.lastTripDay).toBe('01.10.2025');
      expect(rows[6]?.cells.inProgram).toBe('нет');
      expect(winbackFileName('2026-09', NOW)).toBe('Можно вернуть — сентябрь 2026.xlsx');
    });

    it('несобранные сутки поездок — цифр нет, покрытие говорит, какой месяц', async () => {
      await upsertTestHistoryDay('2026-03-10', false);

      try {
        const incomplete = await readWinbackPool('2026-09', NOW);

        expect(incomplete.leftYear).toBeNull();
        expect(incomplete.bands.every((band) => band.people === null && band.selfReturnPercent === null)).toBe(true);
        expect(
          incomplete.coverage.filter((period) => period.coveredDays < period.days).map((period) => period.from),
        ).toEqual(['2026-03-01']);
        await expect(listWinbackExport('2026-09', NOW)).rejects.toThrow('собраны не все сутки');
      } finally {
        await upsertTestHistoryDay('2026-03-10', true);
      }
    });
  });
});

/**
 * Самовозврат: снимки на 30.09.2026 — 01.11.2025 … 01.09.2026. Каждый после проверяемого
 * перерыва ездит раз в 20 суток до конца сентября: других перерывов в 30 суток у него нет,
 * и наблюдения — только те, что ниже.
 *
 * - `onSnapshot` — 15.01, затем с 01.03: на снимке 01.03 последняя поездка до него — 15.01,
 *   45 суток, поездка в день снимка — вернулся. Поездка 01.03 последней до снимка не считается
 * - `lastReturnDay` — 15.01, затем с 30.03 = 01.03 + 29: на 01.03 вернулся
 * - `afterWindow` — 15.01, затем с 31.03 = 01.03 + 30: на 01.03 не вернулся
 * - `longGap` — 20.12.2025, затем с 10.04: на 01.02 и 01.03 — 1–3 месяца, не вернулся; на 01.04 —
 *   102 суток, 3–6 месяцев, вернулся
 * - `prior` — до истории 15.09.2025, затем с 10.12.2025: на 01.11 — 47 суток, не вернулся;
 *   на 01.12 — вернулся
 * - `demo` — как `onSnapshot`, демо: не входит
 *
 * 1–3 месяца: 7 наблюдений, 3 вернулись — 43 %; 3–6: 1 из 1 — 100 %; дальше наблюдений нет.
 */
describe('самовозврат по снимкам', () => {
  let historyDays: string[] = [];
  let pool: DashboardWinbackPool;

  /** Сутки с `from` раз в 20 суток по день отсчёта. */
  const every20Days = (from: string): string[] => {
    const days: string[] = [];

    for (let day = from; day <= AS_OF; day = shiftDayKey(day, 20)) days.push(day);

    return days;
  };

  beforeAll(async () => {
    await cleanupTestMoney([]);
    await cleanupTestMetrics([], []);
    historyDays = await closeTestHistoryDays(HISTORY_FROM, HISTORY_TO);

    const rows: TestPersonDay[] = [];
    const add = async (days: readonly string[]): Promise<TestPerson> => {
      const person = await createTestPerson({ inProgram: false });

      for (const day of days) rows.push({ day, personId: person.personId, trips: 2 });

      return person;
    };

    await add(['2026-01-15', ...every20Days('2026-03-01')]);
    await add(['2026-01-15', ...every20Days('2026-03-30')]);
    await add(['2026-01-15', ...every20Days('2026-03-31')]);
    await add(['2025-12-20', ...every20Days('2026-04-10')]);
    const prior = await add(every20Days('2025-12-10'));
    const demo = await add(['2026-01-15', ...every20Days('2026-03-01')]);

    await insertTestPersonDays(rows);
    await insertTestPersonPrior([{ personId: prior.personId, lastDay: '2025-09-15' }]);
    await markTestPersonDemo(demo.personId);
    await insertTestMoneyRun('2026-10-14', new Date('2026-10-15T01:00:00Z'));

    pool = await readWinbackPool('2026-09', NOW);
  });

  afterAll(async () => {
    await cleanupTestMoney([]);
    await cleanupTestMetrics([], historyDays);
    await cleanupTestData();
    await disconnectDatabase();
  });

  it('доля полосы — вернувшиеся за 30 суток ÷ наблюдения по всем снимкам', () => {
    expect(pool.bands.map((band) => band.selfReturnPercent)).toEqual([43, 100, null, null]);
  });

  it('на день отсчёта все ездят — ушедших нет', () => {
    expect(pool.leftYear).toBe(0);
    expect(pool.overYearMedianRides).toBeNull();
  });
});
