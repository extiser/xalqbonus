import { readLastMetricRecomputeAt } from '#server/repositories/metrics';
import { decomposeMultipliers } from '#server/services/metrics/decomposeMultipliers';
import { metricsMonthRange, readMetricsMonth } from '#server/services/metrics/monthPeriod';
import { readMonthMultipliers } from '#server/services/metrics/readMonthMultipliers';
import type { DashboardLevers } from '#shared/types/dashboard';

/**
 * Вкладка «Рычаги» дашборда за месяц (issue #371): множители поездок, их вклады в изменение
 * и когда посчитана таблица, из которой они взяты.
 *
 * Месяц приходит из запроса как есть; негодный — `MetricsMonthError` (`monthPeriod.ts`).
 */
export const readDashboardLevers = async (monthParam: unknown, now: Date = new Date()): Promise<DashboardLevers> => {
  const month = readMetricsMonth(monthParam, now);
  const [multipliers, computedAt] = await Promise.all([
    readMonthMultipliers(month, now),
    readLastMetricRecomputeAt(),
  ]);

  return {
    month,
    range: metricsMonthRange(now),
    ...multipliers,
    contributions:
      multipliers.base === null ? null : decomposeMultipliers(multipliers.current, multipliers.base),
    computedAt: computedAt?.toISOString() ?? null,
  };
};
