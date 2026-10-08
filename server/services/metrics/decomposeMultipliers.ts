import type { DashboardContributions, DashboardMultipliers } from '#shared/types/dashboard';

/**
 * Вклад каждого множителя в изменение результата — логарифмическое разложение (issue #371).
 *
 * Результат `R = F₁ × F₂ × F₃`, поэтому `ln R₁ − ln R₀` раскладывается в сумму тех же разностей
 * по множителям. Умноженные на логарифмическое среднее `L(R₁, R₀)`, они дают вклады, которые
 * складываются ровно в `R₁ − R₀`, и порядок множителей на результат не влияет (docs/decisions.md
 * → «Метрики дашборда»). Формула одна на проект и живёт здесь, а не на странице: ею раскладываются
 * и поездки «Рычагов», и доход «Денег» (issue #438) — ключи множителей и результата задаёт
 * вызывающий.
 *
 * Если в одном из периодов результат ноль — разложения нет: логарифма нуля не бывает.
 */

/** Логарифмическое среднее: `(a − b) ÷ (ln a − ln b)`, при равных — само число. */
const logarithmicMean = (first: number, second: number): number =>
  first === second ? first : (first - second) / (Math.log(first) - Math.log(second));

/**
 * Округление до целых методом наибольшего остатка: все вниз, недостающие до `total` единицы —
 * тем, у кого дробная часть больше. Так округлённые вклады складываются ровно в изменение.
 */
const roundToTotal = <Key extends string>(
  keys: readonly Key[],
  values: Record<Key, number>,
  total: number,
): Record<Key, number> => {
  const rounded = {} as Record<Key, number>;

  for (const key of keys) {
    rounded[key] = Math.floor(values[key]);
  }

  const shortfall = total - keys.reduce((sum, key) => sum + rounded[key], 0);
  const byRemainder = [...keys].sort(
    (first, second) => values[second] - Math.floor(values[second]) - (values[first] - Math.floor(values[first])),
  );

  for (const key of byRemainder.slice(0, shortfall)) {
    rounded[key] += 1;
  }

  return rounded;
};

/**
 * Вклады множителей `factorKeys` в изменение `resultKey` от `base` к `current`. Результат —
 * целый: вклады целые и в сумме ровно `total`. `null` — в одном из периодов результат ноль.
 */
export const decomposeProduct = <Key extends string, ResultKey extends string>(
  current: Readonly<Record<Key | ResultKey, number>>,
  base: Readonly<Record<Key | ResultKey, number>>,
  resultKey: ResultKey,
  factorKeys: readonly Key[],
): (Record<Key, number> & { total: number }) | null => {
  const currentResult = current[resultKey];
  const baseResult = base[resultKey];

  if (currentResult <= 0 || baseResult <= 0) {
    return null;
  }

  const total = currentResult - baseResult;
  const mean = logarithmicMean(currentResult, baseResult);
  const exact = {} as Record<Key, number>;

  for (const key of factorKeys) {
    exact[key] = mean * Math.log(current[key] / base[key]);
  }

  return { ...roundToTotal(factorKeys, exact, total), total };
};

type TripsFactorKey = 'driversOnLine' | 'daysOnLine' | 'tripsPerDay';

const TRIPS_FACTOR_KEYS: readonly TripsFactorKey[] = ['driversOnLine', 'daysOnLine', 'tripsPerDay'];

/** Поездки `T = D × N × P` «Рычагов». */
export const decomposeMultipliers = (
  current: DashboardMultipliers,
  base: DashboardMultipliers,
): DashboardContributions | null => decomposeProduct(current, base, 'trips', TRIPS_FACTOR_KEYS);
