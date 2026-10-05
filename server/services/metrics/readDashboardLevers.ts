import { readLastMetricRecomputeAt } from '#server/repositories/metrics';
import { multipliersConclusion } from '#server/services/metrics/conclusions';
import { decomposeMultipliers } from '#server/services/metrics/decomposeMultipliers';
import { metricsMonthRange, readMetricsMonth } from '#server/services/metrics/monthPeriod';
import { readDriverFlow } from '#server/services/metrics/readDriverFlow';
import { readLeaders } from '#server/services/metrics/readLeaders';
import { readMonthMultipliers } from '#server/services/metrics/readMonthMultipliers';
import { periodMonthWord } from '#shared/monthNames';
import type { DashboardLevers } from '#shared/types/dashboard';

/**
 * Вкладка «Рычаги» дашборда за месяц (issue #371): множители поездок, их вклады в изменение
 * и когда посчитана таблица, из которой они взяты. Под ними — вывод словами (issue #383)
 * и поток водителей по месяцам (issue #392), под потоком — лидеры по поездкам (issue #402).
 *
 * Месяц приходит из запроса как есть; негодный — `MetricsMonthError` (`monthPeriod.ts`).
 */
export const readDashboardLevers = async (monthParam: unknown, now: Date = new Date()): Promise<DashboardLevers> => {
  const month = readMetricsMonth(monthParam, now);
  const [multipliers, computedAt, flow, leaders] = await Promise.all([
    readMonthMultipliers(month, now),
    readLastMetricRecomputeAt(),
    readDriverFlow(month, now),
    readLeaders(month, now),
  ]);

  const contributions =
    multipliers.base === null ? null : decomposeMultipliers(multipliers.current, multipliers.base);
  const { period, basePeriod } = multipliers;

  return {
    month,
    range: metricsMonthRange(now),
    ...multipliers,
    contributions,
    computedAt: computedAt?.toISOString() ?? null,
    conclusion: multipliersConclusion({
      current: multipliers.current,
      base: multipliers.base,
      contributions,
      toBase: `к ${periodMonthWord(basePeriod, 'dative')}`,
      inBase: `в ${periodMonthWord(basePeriod, 'prepositional')}`,
      periodComplete: period.coveredDays >= period.days,
      baseComplete: basePeriod.coveredDays >= basePeriod.days,
    }),
    flow,
    leaders: leaders.dashboard,
  };
};
