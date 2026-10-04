import type { DashboardContributions, DashboardMultipliers } from '#shared/types/dashboard';

/**
 * Вклад каждого множителя в изменение поездок — логарифмическое разложение (issue #371).
 *
 * Поездки `T = D × N × P`, поэтому `ln T₁ − ln T₀` раскладывается в сумму тех же разностей
 * по множителям. Умноженные на логарифмическое среднее `L(T₁, T₀)`, они дают вклады, которые
 * складываются ровно в `T₁ − T₀`, и порядок множителей на результат не влияет (docs/decisions.md
 * → «Метрики дашборда»). Формула одна на проект и живёт здесь, а не на странице.
 *
 * Если в одном из периодов поездок ноль — разложения нет: логарифма нуля не бывает.
 */

type FactorKey = 'driversOnLine' | 'daysOnLine' | 'tripsPerDay';

const FACTOR_KEYS: readonly FactorKey[] = ['driversOnLine', 'daysOnLine', 'tripsPerDay'];

/** Логарифмическое среднее: `(a − b) ÷ (ln a − ln b)`, при равных — само число. */
const logarithmicMean = (first: number, second: number): number =>
  first === second ? first : (first - second) / (Math.log(first) - Math.log(second));

/**
 * Округление до целых методом наибольшего остатка: все вниз, недостающие до `total` единицы —
 * тем, у кого дробная часть больше. Так округлённые вклады складываются ровно в изменение.
 */
const roundToTotal = (values: Record<FactorKey, number>, total: number): Record<FactorKey, number> => {
  const rounded = { driversOnLine: 0, daysOnLine: 0, tripsPerDay: 0 };

  for (const key of FACTOR_KEYS) {
    rounded[key] = Math.floor(values[key]);
  }

  const shortfall = total - FACTOR_KEYS.reduce((sum, key) => sum + rounded[key], 0);
  const byRemainder = [...FACTOR_KEYS].sort(
    (first, second) => values[second] - Math.floor(values[second]) - (values[first] - Math.floor(values[first])),
  );

  for (const key of byRemainder.slice(0, shortfall)) {
    rounded[key] += 1;
  }

  return rounded;
};

export const decomposeMultipliers = (
  current: DashboardMultipliers,
  base: DashboardMultipliers,
): DashboardContributions | null => {
  if (current.trips <= 0 || base.trips <= 0) {
    return null;
  }

  const total = current.trips - base.trips;
  const mean = logarithmicMean(current.trips, base.trips);
  const exact = { driversOnLine: 0, daysOnLine: 0, tripsPerDay: 0 };

  for (const key of FACTOR_KEYS) {
    exact[key] = mean * Math.log(current[key] / base[key]);
  }

  return { ...roundToTotal(exact, total), total };
};
