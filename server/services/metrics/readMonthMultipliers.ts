import { readMetricPeriodTotals } from '#server/repositories/metrics';
import { monthPeriods, type MonthPeriodDays } from '#server/services/metrics/monthPeriod';
import { withCoverage } from '#server/services/metrics/periodCoverage';
import type { DashboardMultipliers, DashboardPeriod } from '#shared/types/dashboard';

/**
 * Множители поездок за месяц и за базу сравнения — из готовой таблицы `metric_person_days`
 * (issue #371).
 *
 * Поездки `T` — сумма поездок; водители на линии `D` — разные люди; дни на линии `N` — строк
 * таблицы на водителя; поездки в день `P` — поездки на строку. `D × N × P = T` по построению.
 *
 * Покрытие суток — `periodCoverage.ts`.
 */

export type MonthMultipliers = {
  period: DashboardPeriod;
  basePeriod: DashboardPeriod;
  current: DashboardMultipliers;
  /** `null` — в базовом периоде поездок нет. */
  base: DashboardMultipliers | null;
};

const readMultipliers = async (period: MonthPeriodDays): Promise<DashboardMultipliers> => {
  const totals = await readMetricPeriodTotals(period.from, period.to);

  return {
    trips: totals.trips,
    driversOnLine: totals.drivers,
    daysOnLine: totals.drivers > 0 ? totals.personDays / totals.drivers : 0,
    tripsPerDay: totals.personDays > 0 ? totals.trips / totals.personDays : 0,
  };
};

export const readMonthMultipliers = async (month: string, now: Date = new Date()): Promise<MonthMultipliers> => {
  const periods = monthPeriods(month, now);
  const [period, basePeriod, current, base] = await Promise.all([
    withCoverage(periods.period),
    withCoverage(periods.basePeriod),
    readMultipliers(periods.period),
    readMultipliers(periods.basePeriod),
  ]);

  return { period, basePeriod, current, base: base.trips > 0 ? base : null };
};
