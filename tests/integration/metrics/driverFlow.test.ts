import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readDriverFlowByMonth, type DriverFlowMonthRow } from '#server/repositories/metrics';
import { readDriverFlow } from '#server/services/metrics/readDriverFlow';
import { cleanupTestData, createTestPerson, disconnectDatabase } from '../support/database';
import { cleanupTestMetrics, insertTestPersonDays, type TestPersonDay } from '../support/metrics';

/**
 * Поток водителей по месяцам против настоящей базы (issue #392).
 *
 * Запрос сырой — третье исключение правила тестов (docs/infra.md → «Тесты»): миграция таблицы
 * метрик сломала бы его молча. Таблица целиком производная, поэтому фикстура пишется в неё
 * напрямую, а перед сценарием таблица стирается: поток считает всех людей в ней.
 *
 * Люди фикстуры по месяцам, в которых у них есть строки:
 *
 * - `steady` — каждый месяц с октября 2025 по сентябрь 2026
 * - `newcomer` — январь, февраль, апрель, май 2026: пропустил март
 * - `longGap` — ноябрь 2025, март и апрель 2026: пропустил три месяца
 * - `early` — октябрь 2025 и июнь 2026: ездил до начала любого диапазона
 * - `ongoing` — только октябрь 2026, идущий месяц
 */

/** «Сейчас»: идёт октябрь 2026. */
const NOW = new Date('2026-10-05T12:00:00Z');

const MONTHS_BY_PERSON = {
  steady: [
    '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03',
    '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09',
  ],
  newcomer: ['2026-01', '2026-02', '2026-04', '2026-05'],
  longGap: ['2025-11', '2026-03', '2026-04'],
  early: ['2025-10', '2026-06'],
  ongoing: ['2026-10'],
} as const;

type PersonName = keyof typeof MONTHS_BY_PERSON;

const flowOf = (rows: readonly DriverFlowMonthRow[], month: string): Omit<DriverFlowMonthRow, 'month'> => {
  const row = rows.find((candidate) => candidate.month === month);

  if (!row) {
    throw new Error(`нет месяца ${month}`);
  }

  const { month: _month, ...flow } = row;

  return flow;
};

describe('поток водителей по месяцам', () => {
  let rows: DriverFlowMonthRow[];

  beforeAll(async () => {
    await cleanupTestMetrics([], []);

    const personDays: TestPersonDay[] = [];

    for (const name of Object.keys(MONTHS_BY_PERSON) as PersonName[]) {
      const { personId } = await createTestPerson({ inProgram: false });

      for (const month of MONTHS_BY_PERSON[name]) {
        // Двое суток в месяце: человек на линии считается в месяце один раз.
        personDays.push({ day: `${month}-05`, personId, trips: 3 });
        personDays.push({ day: `${month}-20`, personId, trips: 1 });
      }
    }

    await insertTestPersonDays(personDays);
    rows = await readDriverFlowByMonth('2025-10', '2026-09');
  });

  afterAll(async () => {
    await cleanupTestMetrics([], []);
    await cleanupTestData();
    await disconnectDatabase();
  });

  it('водитель, который ездит каждый месяц, есть только «на линии»', () => {
    expect(flowOf(rows, '2026-08')).toEqual({ onLine: 1, newDrivers: 0, returned: 0, left: 0 });
    expect(flowOf(rows, '2026-09')).toEqual({ onLine: 1, newDrivers: 0, returned: 0, left: 0 });
  });

  it('первый месяц человека — «новый»', () => {
    expect(flowOf(rows, '2025-11').newDrivers).toBe(1);
    expect(flowOf(rows, '2026-01')).toEqual({ onLine: 2, newDrivers: 1, returned: 0, left: 0 });
  });

  it('пропуск одного месяца — «ушёл» в пропущенном и «вернулся» в следующем', () => {
    expect(flowOf(rows, '2026-03').left).toBe(1);
    expect(flowOf(rows, '2026-04')).toEqual({ onLine: 3, newDrivers: 0, returned: 1, left: 0 });
  });

  it('возврат после трёх пропущенных месяцев — «вернулся»', () => {
    expect(flowOf(rows, '2025-12')).toEqual({ onLine: 1, newDrivers: 0, returned: 0, left: 1 });
    expect(flowOf(rows, '2026-03')).toEqual({ onLine: 2, newDrivers: 0, returned: 1, left: 1 });
  });

  it('на линии(M) − на линии(M−1) = новые + вернулись − ушли в каждом месяце', () => {
    expect(rows.map((row) => row.month)).toEqual([
      '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03',
      '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09',
    ]);

    let previousOnLine = 0;

    for (const row of rows) {
      expect(row.onLine - previousOnLine).toBe(row.newDrivers + row.returned - row.left);
      previousOnLine = row.onLine;
    }
  });

  it('«новые» смотрят всю таблицу, а не только запрошенный диапазон', async () => {
    const [june] = await readDriverFlowByMonth('2026-06', '2026-06');

    expect(june).toEqual({ month: '2026-06', onLine: 2, newDrivers: 0, returned: 1, left: 1 });
  });

  it('идущий месяц в ответ не попадает: панель — последний закрытый', async () => {
    const flow = await readDriverFlow('2026-10', NOW);

    expect(flow.selectedOngoing).toBe(true);
    expect(flow.months.map((month) => month.month)).toEqual([
      '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09',
    ]);
    expect(flow.panel?.month).toBe('2026-09');
    expect(flow.firstMonthOnLine).toBeNull();
  });

  it('закрытый месяц — сам себе панель, график начинается не раньше ноября 2025', async () => {
    const flow = await readDriverFlow('2025-12', NOW);

    expect(flow.selectedOngoing).toBe(false);
    expect(flow.months.map((month) => month.month)).toEqual(['2025-11', '2025-12']);
    expect(flow.panel).toMatchObject({ month: '2025-12', onLine: 1, onLineChange: -1 });
  });

  it('октябрь 2025 — потока нет, «на линии» — его водители', async () => {
    const flow = await readDriverFlow('2025-10', NOW);

    expect(flow).toEqual({ months: [], panel: null, selectedOngoing: false, firstMonthOnLine: 2, conclusion: null });
  });

  it('ранняя история — у июня 2026 есть, у июля нет', async () => {
    const flow = await readDriverFlow('2026-07', NOW);
    const earlyByMonth = Object.fromEntries(flow.months.map((month) => [month.month, month.earlyHistory]));

    expect(earlyByMonth['2026-06']).toBe(true);
    expect(earlyByMonth['2026-07']).toBe(false);
  });
});
