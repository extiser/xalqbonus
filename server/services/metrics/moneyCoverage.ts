import { listClosedTransactionDays } from '#server/repositories/metrics';
import { TRANSACTIONS_COMPLETE_FROM } from '#server/services/metrics/constants';
import type { MonthPeriodDays } from '#server/services/metrics/monthPeriod';
import { shiftDayKey } from '#server/utils/parkTime';
import type { DashboardPeriod } from '#shared/types/dashboard';

/**
 * Покрытие суток периода деньгами (issue #438) — устроено как `countCoveredDays`
 * в `periodCoverage.ts`.
 *
 * Сутки `d` по Ташкенту полны, только если таблица денег их уже посчитала — `d` не позже
 * последних суток успешного прогона, — и транзакции за них собраны: с `TRANSACTIONS_COMPLETE_FROM`
 * их держит живой сбор, раньше — обе порции прогона истории по UTC, `d − 1` и `d`, закрыты
 * в `fleet_transaction_days` (docs/decisions.md → «Деньги на дашборде», абзац о полных сутках).
 *
 * `lastComputedDay` — последние сутки успешного прогона денег; `null` — прогона не было,
 * и не покрыто ничего.
 */
const countCoveredDays = async (period: MonthPeriodDays, lastComputedDay: string | null): Promise<number> => {
  if (lastComputedDay === null || period.days === 0) {
    return 0;
  }

  const closed = new Set(await listClosedTransactionDays(shiftDayKey(period.from, -1), period.to));
  let covered = 0;

  for (let day = period.from; day <= period.to && day <= lastComputedDay; day = shiftDayKey(day, 1)) {
    if (day >= TRANSACTIONS_COMPLETE_FROM || (closed.has(shiftDayKey(day, -1)) && closed.has(day))) {
      covered += 1;
    }
  }

  return covered;
};

export const withMoneyCoverage = async (
  period: MonthPeriodDays,
  lastComputedDay: string | null,
): Promise<DashboardPeriod> => ({
  ...period,
  coveredDays: await countCoveredDays(period, lastComputedDay),
});
