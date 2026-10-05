import { describe, expect, it } from 'vitest';

import {
  driverFlowConclusion,
  multipliersConclusion,
  programEconomyConclusion,
} from '#server/services/metrics/conclusions';
import { DRIVER_FLOW_CASES, MULTIPLIERS_CASES, PROGRAM_ECONOMY_CASES } from './fixtures/dashboardConclusions';

/**
 * Выводы словами под плитками дашборда против эталона — таблиц
 * `_reference/design/web/dashboard/conclusions.md` (docs/infra.md → «Тесты», четвёртое
 * исключение). Каждая строка обеих таблиц, каждое правило «вывода нет» и границы порогов:
 * доля ровно 2 %, вклад ровно четверть `|Δ|`, ровно 10 заказов, поток ровно 2 % от `D₀`.
 * Строка сверяется дословно.
 */

describe('вывод под множителями', () => {
  it.each(MULTIPLIERS_CASES)('$rule', ({ input, expected }) => {
    expect(multipliersConclusion(input)).toBe(expected);
  });
});

describe('вывод под «Экономикой программы»', () => {
  it.each(PROGRAM_ECONOMY_CASES)('$rule', ({ input, expected }) => {
    expect(programEconomyConclusion(input)).toBe(expected);
  });
});

describe('вывод под панелью «Потока водителей»', () => {
  it.each(DRIVER_FLOW_CASES)('$rule', ({ input, expected }) => {
    expect(driverFlowConclusion(input)).toBe(expected);
  });
});
