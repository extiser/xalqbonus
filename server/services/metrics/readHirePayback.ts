import { readHireCost } from '#server/repositories/dashboardHireCosts';
import { countHired, readHireCohortTotals, readLastMetricMoneyRun } from '#server/repositories/metrics';
import { moneyCoverageByMonth } from '#server/services/metrics/moneyCoverage';
import { monthPeriods, wholeMonthPeriod } from '#server/services/metrics/monthPeriod';
import {
  isMoneyComplete,
  monthDate,
  readValueRates,
  valueMonthOf,
  yearCohorts,
} from '#server/services/metrics/personMonthValue';
import { hireCostPerHired, hirePaybackOf } from '#shared/hireCost';
import type { DashboardHireCost, DashboardHirePayback } from '#shared/types/dashboard';

/**
 * «Окупается ли найм» на «Глубине» (issue #445). Только реестр, таблица `metric_person_months`
 * и запись расходов: транзакции не читаются.
 *
 * Месяц плитки T — месяц экрана, и идущий тоже: у идущего нанятые считаются с 1-го по вчерашние
 * сутки, а расходы — бюджет месяца. Расходы — только запись месяца T: записи других месяцев
 * на него не действуют. Стоимость одного — расходы ÷ нанятых в T.
 *
 * Доход с нанятого — тем же расчётом, что «Цена водителя за год» (`personMonthValue.ts`): месяц
 * цены — закрытый T, у идущего — прошлый; наборы найма, ставки и покрытие — по нему. Среднее —
 * по всем нанятым наборов, вместе с теми, кто так и не поехал: на них парк тоже тратил.
 * Нанятые и расходы от прогона денег не зависят и есть всегда.
 */
export const readHirePayback = async (month: string, now: Date = new Date()): Promise<DashboardHirePayback> => {
  const { month: valueMonth, ongoing } = valueMonthOf(month, now);
  const { from: cohortsFrom, to: cohortsTo } = yearCohorts(valueMonth);
  // Месяц экрана уже проверен `readMetricsMonth`: у идущего период кончается вчерашними сутками.
  const { period } = monthPeriods(month, now);

  const [lastRun, monthHired, costRow] = await Promise.all([
    readLastMetricMoneyRun(),
    countHired(period.from, period.to),
    readHireCost(month),
  ]);

  const coverage = await moneyCoverageByMonth(cohortsFrom, valueMonth, lastRun?.daysTo ?? null);
  const rates = isMoneyComplete(coverage) ? await readValueRates(valueMonth) : null;
  const totals =
    rates === null
      ? null
      : await readHireCohortTotals(monthDate(cohortsFrom), wholeMonthPeriod(cohortsTo).to, rates);

  // Нанятых в наборах нет — среднего нет: ноль на плитке читался бы как «нанятый ничего не приносит».
  const valuePerHired = totals?.value == null ? null : Math.round(totals.value);

  const cost: DashboardHireCost | null =
    costRow === null ? null : { amount: costRow.amount, perHired: hireCostPerHired(costRow.amount, monthHired) };

  return {
    month,
    ongoing,
    valueMonth,
    cohortsFrom,
    cohortsTo,
    coverage,
    valuePerHired,
    hired: totals?.hired ?? null,
    notRode: totals?.notRode ?? null,
    notRodePercent:
      totals === null || totals.hired === 0 ? null : Math.round((totals.notRode / totals.hired) * 100),
    monthHired,
    monthHiredTo: period.to,
    cost,
    payback: cost === null || valuePerHired === null ? null : hirePaybackOf(valuePerHired, cost.amount, monthHired),
  };
};
