import { listClosedHistoryDays, readMetricPeriodTotals } from '#server/repositories/metrics';
import { TRIPS_COMPLETE_FROM } from '#server/services/metrics/constants';
import { monthPeriods, type MonthPeriodDays } from '#server/services/metrics/monthPeriod';
import { shiftDayKey } from '#server/utils/parkTime';
import type { DashboardMultipliers, DashboardPeriod } from '#shared/types/dashboard';

/**
 * Множители поездок за месяц и за базу сравнения — из готовой таблицы `metric_person_days`
 * (issue #371).
 *
 * Поездки `T` — сумма поездок; водители на линии `D` — разные люди; дни на линии `N` — строк
 * таблицы на водителя; поездки в день `P` — поездки на строку. `D × N × P = T` по построению.
 *
 * Покрытие суток: сутки `d` по Ташкенту — это `ended_at` с `d−1 19:00Z` по `d 19:00Z`, они
 * лежат в двух порциях сбора истории, `d − 1` и `d`, и полны, только когда закрыты обе
 * (docs/decisions.md → «Сутки — с 00:00 до 00:00 по Ташкенту»). С `TRIPS_COMPLETE_FROM`
 * сутки полны без истории: их держит живая синхронизация.
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

const countCoveredDays = async (period: MonthPeriodDays): Promise<number> => {
  const closed = new Set(await listClosedHistoryDays(shiftDayKey(period.from, -1), period.to));
  let covered = 0;

  for (let day = period.from; day <= period.to; day = shiftDayKey(day, 1)) {
    if (day >= TRIPS_COMPLETE_FROM || (closed.has(shiftDayKey(day, -1)) && closed.has(day))) {
      covered += 1;
    }
  }

  return covered;
};

const withCoverage = async (period: MonthPeriodDays): Promise<DashboardPeriod> => ({
  ...period,
  coveredDays: await countCoveredDays(period),
});

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
