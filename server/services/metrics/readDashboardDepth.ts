import { metricsMonthRange, monthPeriods, readMetricsMonth } from '#server/services/metrics/monthPeriod';
import { withCoverage } from '#server/services/metrics/periodCoverage';
import { readDriverValue } from '#server/services/metrics/readDriverValue';
import { readHirePayback } from '#server/services/metrics/readHirePayback';
import { readNewcomers } from '#server/services/metrics/readNewcomers';
import { readOutsideProgram } from '#server/services/metrics/readOutsideProgram';
import { readPointsWeekly } from '#server/services/metrics/readPointsWeekly';
import { readProgramEconomy } from '#server/services/metrics/readProgramEconomy';
import { readWinbackPool } from '#server/services/metrics/readWinbackPool';
import type { DashboardDepth } from '#shared/types/dashboard';

/**
 * Вкладка «Глубина» дашборда за месяц (issue #373): баллы по неделям, экономика программы,
 * водители вне программы, новички (issue #407), цена водителя за год (issue #442), «Можно вернуть»
 * (issue #446) и «Окупается ли найм» (issue #445). Период — тот же, что у «Рычагов»: текущий месяц
 * по вчерашние сутки.
 *
 * Месяц приходит из запроса как есть; негодный — `MetricsMonthError` (`monthPeriod.ts`).
 */
export const readDashboardDepth = async (monthParam: unknown, now: Date = new Date()): Promise<DashboardDepth> => {
  const month = readMetricsMonth(monthParam, now);
  const { period } = monthPeriods(month, now);
  const [coveredPeriod, weeks, economy, outside, newcomers, driverValue, winback, hirePayback] = await Promise.all([
    withCoverage(period),
    readPointsWeekly(period.to, now),
    readProgramEconomy(period),
    readOutsideProgram(period),
    readNewcomers(month, now),
    readDriverValue(month, now),
    readWinbackPool(month, now),
    readHirePayback(month, now),
  ]);

  return {
    month,
    range: metricsMonthRange(now),
    period: coveredPeriod,
    weeks,
    economy,
    outside,
    newcomers: newcomers.dashboard,
    driverValue,
    winback,
    hirePayback,
  };
};
