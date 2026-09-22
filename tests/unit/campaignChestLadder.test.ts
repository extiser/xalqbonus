import { describe, expect, it } from 'vitest';

import {
  chestLadder,
  dayChestState,
  figuresFromCounts,
  weekFigures,
  type ChestStepState,
  type DayChestState,
} from '#server/services/campaigns/weekProgress';
import { CHEST_LADDER_STATES_TABLE } from './fixtures/chestLadderStates';

/**
 * Лестница сундуков против перебора (issue #181; docs/infra.md → «Тесты», четвёртое исключение).
 *
 * Расчёт чистый: тройка «день, зачтено, цель сегодня» и длина окна подаются числами, базы нет.
 * Строки перебора сверяются целиком, условия приёмки issue — отдельными случаями, чтобы
 * их нарушение называлось своими словами, а не номером строки.
 */

const STEP_STATES: Record<string, ChestStepState> = {
  достижим: 'reachable',
  'к открытию': 'to_open',
  погас: 'unreachable',
};

type ReferenceRow = {
  line: string;
  windowDays: number;
  day: number;
  done: number;
  goalTakenToday: boolean;
  threeDays: ChestStepState;
  week: ChestStepState;
};

const parseTable = (table: string): ReferenceRow[] =>
  table
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\| \d/.test(line))
    .map((line) => {
      const [windowDays, day, done, taken, threeDays, week] = line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim());
      const threeDaysState = STEP_STATES[threeDays ?? ''];
      const weekState = STEP_STATES[week ?? ''];

      if (!threeDaysState || !weekState) {
        throw new Error(`строка перебора не разобралась: ${line}`);
      }

      return {
        line,
        windowDays: Number(windowDays),
        day: Number(day),
        done: Number(done),
        goalTakenToday: taken === 'да',
        threeDays: threeDaysState,
        week: weekState,
      };
    });

const rows = parseTable(CHEST_LADDER_STATES_TABLE);

/** Поездки по дням окна: `qualifiedDays` первых дней по пять, остальные — нули. */
const tripsWith = (windowDays: number, qualified: readonly number[]): number[] =>
  Array.from({ length: windowDays }, (_unused, index) => (qualified.includes(index + 1) ? 5 : 0));

describe('лестница сундуков: перебор', () => {
  it('перебор перенесён целиком: окна 7, 5 и 3 — 56 + 30 + 12 строк', () => {
    expect(rows).toHaveLength(98);
  });

  it.each(rows.map((row) => [row.line, row] as const))('%s', (_line, row) => {
    const figures = figuresFromCounts(row.windowDays, row.day, row.done, row.goalTakenToday);
    const ladder = chestLadder(figures, [], []);

    expect(ladder.threeDays).toBe(row.threeDays);
    expect(ladder.week).toBe(row.week);
  });
});

describe('лестница сундуков: условия приёмки', () => {
  it('один зачётный день — один сундук дня к открытию, ступени закрыты и достижимы', () => {
    const dayTrips = tripsWith(7, [1]);
    const ladder = chestLadder(weekFigures(7, 2, dayTrips), dayTrips, []);

    expect(ladder.days.map((chest) => chest.state)).toEqual([
      'to_open',
      'today',
      'ahead',
      'ahead',
      'ahead',
      'ahead',
      'ahead',
    ]);
    expect(ladder.threeDays).toBe('reachable');
    expect(ladder.week).toBe('reachable');
  });

  it('третий зачётный день открывает сундук трёх дней сразу, пятый — недели', () => {
    const third = tripsWith(7, [1, 2, 3]);
    const fifth = tripsWith(7, [1, 2, 3, 4, 5]);

    expect(chestLadder(weekFigures(7, 3, third), third, []).threeDays).toBe('to_open');
    expect(chestLadder(weekFigures(7, 5, fifth), fifth, []).week).toBe('to_open');
  });

  it('без зачётных дней на окне в семь недельный гаснет с четвёртого дня, трёхдневный — с шестого', () => {
    const empty = tripsWith(7, []);
    const weekByDay = [1, 2, 3, 4, 5, 6, 7].map(
      (day) => chestLadder(weekFigures(7, day, empty), empty, []).week,
    );
    const threeDaysByDay = [1, 2, 3, 4, 5, 6, 7].map(
      (day) => chestLadder(weekFigures(7, day, empty), empty, []).threeDays,
    );

    expect(weekByDay).toEqual([
      'reachable',
      'reachable',
      'reachable',
      'unreachable',
      'unreachable',
      'unreachable',
      'unreachable',
    ]);
    expect(threeDaysByDay).toEqual([
      'reachable',
      'reachable',
      'reachable',
      'reachable',
      'reachable',
      'unreachable',
      'unreachable',
    ]);
  });

  it('семь зачётных дней — семь сундуков дня и ничего сверх двух ступеней', () => {
    const all = tripsWith(7, [1, 2, 3, 4, 5, 6, 7]);
    const ladder = chestLadder(weekFigures(7, 7, all), all, []);

    expect(ladder.days).toHaveLength(7);
    expect(ladder.days.every((chest) => chest.state === 'to_open')).toBe(true);
    expect(ladder.threeDays).toBe('to_open');
    expect(ladder.week).toBe('to_open');
  });

  it('открытый сундук остаётся открытым, какими бы ни были числа', () => {
    const dayTrips = tripsWith(7, [1, 2, 3]);
    const ladder = chestLadder(weekFigures(7, 4, dayTrips), dayTrips, [
      { kind: 'day', dayNumber: 2 },
      { kind: 'three_days', dayNumber: null },
    ]);

    expect(ladder.days.map((chest) => chest.state).slice(0, 4)).toEqual([
      'to_open',
      'opened',
      'to_open',
      'today',
    ]);
    expect(ladder.threeDays).toBe('opened');
    expect(ladder.week).toBe('reachable');
  });

  it('замершая неделя: все карточки в прошлом, незачтённые — упущены', () => {
    const dayTrips = [5, 3, 0, 5, 5, 5, 0];
    const figures = figuresFromCounts(7, 8, 4, false);
    const ladder = chestLadder(figures, dayTrips, []);

    expect(ladder.days.map((chest) => chest.state)).toEqual([
      'to_open',
      'missed',
      'missed',
      'to_open',
      'to_open',
      'to_open',
      'missed',
    ]);
    expect(ladder.threeDays).toBe('to_open');
    expect(ladder.week).toBe('unreachable');
  });
});

describe('карточка сундука дня', () => {
  // день, сегодня, поездок, открыт → состояние
  const cases: [number, number, number, boolean, DayChestState][] = [
    [3, 2, 0, false, 'ahead'],
    [2, 2, 3, false, 'today'],
    [2, 2, 5, false, 'to_open'],
    [2, 2, 5, true, 'opened'],
    [1, 2, 7, false, 'to_open'],
    [1, 2, 4, false, 'missed'],
    [1, 2, 0, false, 'missed'],
    [1, 2, 5, true, 'opened'],
  ];

  it.each(cases)('день %i при сегодняшнем %i, поездок %i, открыт %s → %s', (day, today, trips, opened, state) => {
    expect(dayChestState(day, today, trips, opened)).toBe(state);
  });
});
