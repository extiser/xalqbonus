import { listClosedHistoryDays } from '#server/repositories/metrics';
import { METRICS_FIRST_DAY, TRIPS_COMPLETE_FROM } from '#server/services/metrics/constants';
import { wholeMonthPeriod, type MonthPeriodDays } from '#server/services/metrics/monthPeriod';
import { shiftDayKey } from '#server/utils/parkTime';
import { shiftMonth } from '#shared/monthNames';
import type { DashboardPeriod } from '#shared/types/dashboard';

/**
 * Покрытие суток периода поездками (issue #371) — одно на вкладки дашборда.
 *
 * Сутки `d` по Ташкенту — это `ended_at` с `d−1 19:00Z` по `d 19:00Z`, они лежат в двух порциях
 * сбора истории, `d − 1` и `d`, и полны, только когда закрыты обе (docs/decisions.md → «Сутки —
 * с 00:00 до 00:00 по Ташкенту»). С `TRIPS_COMPLETE_FROM` сутки полны без истории: их держит
 * живая синхронизация.
 */
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

export const withCoverage = async (period: MonthPeriodDays): Promise<DashboardPeriod> => ({
  ...period,
  coveredDays: await countCoveredDays(period),
});

/** Целых суток от `from` до `to`. */
const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * Сутки `from`–`to` по месяцам с покрытием (issue #402); раньше истории — не проверяются:
 * это не пропуск, а отсутствие истории. Пусто — проверять нечего.
 */
export const coverageByMonth = async (from: string, to: string): Promise<DashboardPeriod[]> => {
  const start = from < METRICS_FIRST_DAY ? METRICS_FIRST_DAY : from;
  const segments: MonthPeriodDays[] = [];

  for (let month = start.slice(0, 7); month <= to.slice(0, 7); month = shiftMonth(month, 1)) {
    const whole = wholeMonthPeriod(month);
    const segmentFrom = whole.from < start ? start : whole.from;
    const segmentTo = whole.to > to ? to : whole.to;

    if (segmentFrom <= segmentTo) {
      const days = daysBetween(segmentFrom, segmentTo) + 1;

      segments.push({ from: segmentFrom, to: segmentTo, days, partial: days < whole.days });
    }
  }

  return Promise.all(segments.map((segment) => withCoverage(segment)));
};

/** Собраны все сутки каждого периода. */
export const isComplete = (coverage: readonly DashboardPeriod[]): boolean =>
  coverage.every((period) => period.coveredDays >= period.days);
