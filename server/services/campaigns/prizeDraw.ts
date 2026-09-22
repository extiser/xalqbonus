import { randomInt } from 'node:crypto';

/**
 * Розыгрыш варианта приза по весам (issue #181). Чистые функции без базы: доли — бюджет акции
 * (`product/calc/wave-1-chests-2026-09-16.md`, 70 / 20 / 8 / 2), и ошибка на единицу в сравнении
 * сместила бы их так, что в проде это ничем не заметить. Поэтому выбор по броску отделён
 * от самого броска и проверяется таблицей границ (`tests/unit/prizeDraw.test.ts`).
 */

type Weighted = { weight: number };

/**
 * Вариант по броску: доля варианта — вес, делённый на сумму весов ступени. `roll` — целое
 * в `[0, сумма)`: вариант с весом `w` занимает ровно `w` значений подряд. Бросок за пределом
 * суммы — `null`. Порядок вариантов тот, что отдал репозиторий, — от него доли не зависят.
 */
export const pickPrizeByWeight = <Prize extends Weighted>(
  prizes: readonly Prize[],
  roll: number,
): Prize | null => {
  let threshold = 0;

  for (const prize of prizes) {
    threshold += prize.weight;

    if (roll < threshold) {
      return prize;
    }
  }

  return null;
};

/**
 * Розыгрыш: бросок `randomInt` из `node:crypto`, как у кодов заказа, — равномерный на `[0, сумма)`.
 * Вариантов нет — `null`.
 */
export const drawPrize = <Prize extends Weighted>(prizes: readonly Prize[]): Prize | null => {
  const total = prizes.reduce((sum, prize) => sum + prize.weight, 0);

  return total > 0 ? pickPrizeByWeight(prizes, randomInt(total)) : null;
};
