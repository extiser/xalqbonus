import { listClosedTransactionDays } from '#server/repositories/metrics';
import { MONEY_FIRST_DAY, TRANSACTIONS_COMPLETE_FROM } from '#server/services/metrics/constants';
import { wholeMonthPeriod, type MonthPeriodDays } from '#server/services/metrics/monthPeriod';
import { shiftDayKey } from '#server/utils/parkTime';
import { shiftMonth } from '#shared/monthNames';
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
/** Сутки, которым вместо двух порций сбора хватает своей одной: `day` из UTC-порции `day`. */
type OwnPortionDays = ReadonlySet<string>;

const NO_OWN_PORTION_DAYS: OwnPortionDays = new Set();

const countCovered = (
  period: MonthPeriodDays,
  lastComputedDay: string,
  closed: ReadonlySet<string>,
  ownPortionDays: OwnPortionDays = NO_OWN_PORTION_DAYS,
): number => {
  let covered = 0;

  for (let day = period.from; day <= period.to && day <= lastComputedDay; day = shiftDayKey(day, 1)) {
    const previousClosed = ownPortionDays.has(day) || closed.has(shiftDayKey(day, -1));

    if (day >= TRANSACTIONS_COMPLETE_FROM || (previousClosed && closed.has(day))) {
      covered += 1;
    }
  }

  return covered;
};

const countCoveredDays = async (period: MonthPeriodDays, lastComputedDay: string | null): Promise<number> => {
  if (lastComputedDay === null || period.days === 0) {
    return 0;
  }

  const closed = new Set(await listClosedTransactionDays(shiftDayKey(period.from, -1), period.to));

  return countCovered(period, lastComputedDay, closed);
};

export const withMoneyCoverage = async (
  period: MonthPeriodDays,
  lastComputedDay: string | null,
): Promise<DashboardPeriod> => ({
  ...period,
  coveredDays: await countCoveredDays(period, lastComputedDay),
});

/**
 * Покрытие деньгами месяцев `fromMonth`–`toMonth` целиком, по месяцу на период — «Цена водителя
 * за год» (issue #442): журнал сбора читается один раз на всё окно, а не по запросу на месяц.
 *
 * Первые сутки денег `MONEY_FIRST_DAY` здесь полны, когда закрыта их собственная порция по UTC:
 * порция 2024-03-31 не собрана, и 1 апреля 2024 по Ташкенту остаётся без первых пяти часов.
 * Иначе плитка не считалась бы ни за один месяц, чьи наборы «за два года» начинаются с апреля 2024.
 * Плитке это почти не важно: апрель 2024 — только месяц набора, по нему выбираются лидеры, а доход
 * набора берётся с мая. «Деньги» правило не меняет — там апрель 2024 остаётся неполным.
 */
export const moneyCoverageByMonth = async (
  fromMonth: string,
  toMonth: string,
  lastComputedDay: string | null,
): Promise<DashboardPeriod[]> => {
  const periods: MonthPeriodDays[] = [];

  for (let month = fromMonth; month <= toMonth; month = shiftMonth(month, 1)) {
    periods.push(wholeMonthPeriod(month));
  }

  const first = periods[0];
  const last = periods.at(-1);

  if (lastComputedDay === null || first === undefined || last === undefined) {
    return periods.map((period) => ({ ...period, coveredDays: 0 }));
  }

  const closed = new Set(await listClosedTransactionDays(shiftDayKey(first.from, -1), last.to));

  const ownPortionDays = new Set([MONEY_FIRST_DAY]);

  return periods.map((period) => ({
    ...period,
    coveredDays: countCovered(period, lastComputedDay, closed, ownPortionDays),
  }));
};
