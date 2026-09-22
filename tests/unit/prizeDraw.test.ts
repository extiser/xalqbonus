import { describe, expect, it } from 'vitest';

import { drawPrize, pickPrizeByWeight } from '#server/services/campaigns/prizeDraw';

/**
 * Розыгрыш сундука по весам (issue #181; docs/infra.md → «Тесты», ядро начисления).
 *
 * Доли — бюджет акции: 70 / 20 / 8 / 2 (`product/calc/wave-1-chests-2026-09-16.md`). Бросок —
 * целое в `[0, 100)`, и вариант с весом `w` обязан занимать ровно `w` значений подряд. Ошибка
 * на единицу в сравнении сдвинула бы границы на бросок, и в проде это ничем не заметить, —
 * поэтому проверяются обе стороны каждой границы.
 */

const PRIZES = [
  { name: 'обычный', weight: 70 },
  { name: 'редкий', weight: 20 },
  { name: 'эпический', weight: 8 },
  { name: 'легендарный', weight: 2 },
] as const;

// бросок → вариант
const BOUNDARIES: [number, string][] = [
  [0, 'обычный'],
  [69, 'обычный'],
  [70, 'редкий'],
  [89, 'редкий'],
  [90, 'эпический'],
  [97, 'эпический'],
  [98, 'легендарный'],
  [99, 'легендарный'],
];

describe('розыгрыш по весам', () => {
  it.each(BOUNDARIES)('бросок %i → %s', (roll, name) => {
    expect(pickPrizeByWeight(PRIZES, roll)?.name).toBe(name);
  });

  it('каждый вариант занимает ровно столько бросков, сколько весит', () => {
    const counts = new Map<string, number>();

    for (let roll = 0; roll < 100; roll += 1) {
      const name = pickPrizeByWeight(PRIZES, roll)?.name ?? 'нет';

      counts.set(name, (counts.get(name) ?? 0) + 1);
    }

    expect(Object.fromEntries(counts)).toEqual({
      обычный: 70,
      редкий: 20,
      эпический: 8,
      легендарный: 2,
    });
  });

  it('бросок за пределом суммы — null', () => {
    expect(pickPrizeByWeight(PRIZES, 100)).toBeNull();
    expect(pickPrizeByWeight(PRIZES, 1000)).toBeNull();
  });

  it.each([1, 7, 100])('один вариант с весом %i выпадает на любом броске внутри суммы', (weight) => {
    const only = [{ name: 'единственный', weight }];

    expect(pickPrizeByWeight(only, 0)?.name).toBe('единственный');
    expect(pickPrizeByWeight(only, weight - 1)?.name).toBe('единственный');
    expect(pickPrizeByWeight(only, weight)).toBeNull();
    expect(drawPrize(only)?.name).toBe('единственный');
  });

  it('вариантов нет — розыгрыша нет', () => {
    expect(pickPrizeByWeight([], 0)).toBeNull();
    expect(drawPrize([])).toBeNull();
  });
});
