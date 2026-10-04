import { listClosedHistoryDays } from '#server/repositories/metrics';
import { TRIPS_COMPLETE_FROM } from '#server/services/metrics/constants';
import type { MonthPeriodDays } from '#server/services/metrics/monthPeriod';
import { shiftDayKey } from '#server/utils/parkTime';
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
