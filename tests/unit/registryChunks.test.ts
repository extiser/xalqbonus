import { describe, expect, it } from 'vitest';

import {
  deepestOffset,
  fitsByDepth,
  MAX_OFFSET_DEPTH,
  pagesFor,
  passesFor,
  TWO_END_THRESHOLD,
  windowAccepts,
} from '#server/services/sync/registryChunks';

/**
 * Арифметика нарезки реестра.
 *
 * Проверяется тестом, а не живым API, по единственной причине: ошибка здесь выражается
 * не в отказе, а в глубокой странице, которую Fleet API отобьёт мгновенно, — и увидеть
 * её можно только на живом обходе в 25 390 профилей (docs/yandex-fleet.md → «Лимитер
 * считает стоимость запроса, а не частоту»).
 */
describe('нарезка реестра', () => {
  it('кусок не крупнее порога берётся одним проходом', () => {
    expect(passesFor(TWO_END_THRESHOLD)).toEqual([{ direction: 'asc', target: TWO_END_THRESHOLD }]);
  });

  it('кусок крупнее порога берётся с двух концов, и половины покрывают его целиком', () => {
    const passes = passesFor(6_002);

    expect(passes).toEqual([
      { direction: 'asc', target: 3_001 },
      { direction: 'desc', target: 3_001 },
    ]);
    expect(passes[0]?.target ?? 0).toBeGreaterThanOrEqual(6_002 - (passes[1]?.target ?? 0));
  });

  it('нечётный кусок делится без потери записи посередине', () => {
    const passes = passesFor(4_193);

    expect((passes[0]?.target ?? 0) + (passes[1]?.target ?? 0)).toBe(4_193);
  });

  it('самый крупный кусок парка укладывается в разрешённую глубину', () => {
    // 6 002 — размер куска «working / Баннер» в выгрузке 27.08.2026, самого крупного
    // в парке. Глубина обхода не поднялась выше 3 000 при потолке 3 500.
    expect(deepestOffset(passesFor(6_002))).toBe(3_000);
    expect(fitsByDepth(6_002)).toBe(true);
  });

  it('кусок, которому не хватает глубины, честно объявляется негодным', () => {
    // Вдвое больше самого крупного: обход такого куска ушёл бы за 3 500, и его надо
    // дробить окнами, а не пытаться взять «как есть».
    expect(fitsByDepth(12_000)).toBe(false);
    expect(deepestOffset(passesFor(12_000))).toBeGreaterThan(MAX_OFFSET_DEPTH);
  });

  it('страницы считаются с запасом на неполную последнюю', () => {
    expect(pagesFor(1)).toBe(1);
    expect(pagesFor(1_000)).toBe(1);
    expect(pagesFor(1_001)).toBe(2);
  });

  it('строгая ступень принимает только окно в одну страницу', () => {
    const strict = windowAccepts('windows_strict');

    expect(strict(1_000)).toBe(true);
    expect(strict(1_001)).toBe(false);
    // Обычная ступень довольствуется тем, что окно берётся разрешённой глубиной.
    expect(windowAccepts('windows')(1_001)).toBe(true);
  });
});
