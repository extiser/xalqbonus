import { readHireCostAt } from '#server/repositories/dashboardHireCosts';
import { listHiredByMonth, readHireCohortTotals, readLastMetricMoneyRun } from '#server/repositories/metrics';
import { moneyCoverageByMonth } from '#server/services/metrics/moneyCoverage';
import { metricsMonthRange } from '#server/services/metrics/monthPeriod';
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
 * «Окупается ли найм» на «Глубине» (issue #445) — docs/decisions.md → «Окупаемость найма
 * на дашборде». Только реестр, таблица `metric_person_months` и записи расходов: транзакции
 * не читаются.
 *
 * Месяц плитки T, наборы `T − 23 … T − 12`, ставки месяца T и покрытие — как у «Цены водителя
 * за год», общим модулем `personMonthValue.ts`. Доход с нанятого — среднее по всем нанятым
 * наборов, вместе с теми, кто так и не поехал: на них парк тоже тратил.
 *
 * Расходы — запись, действующая в T; стоимость одного — они ÷ нанятых в T. Нанятые по месяцам
 * от первого месяца дашборда по T идут в ответ целиком: окно считает по ним стоимость в любом
 * месяце из «Действует с» без запроса.
 */
export const readHirePayback = async (month: string, now: Date = new Date()): Promise<DashboardHirePayback> => {
  const { month: valueMonth, ongoing } = valueMonthOf(month, now);
  const { from: cohortsFrom, to: cohortsTo } = yearCohorts(valueMonth);
  const { firstMonth } = metricsMonthRange(now);

  const [lastRun, hiredByMonth, costRow] = await Promise.all([
    readLastMetricMoneyRun(),
    firstMonth <= valueMonth ? listHiredByMonth(monthDate(firstMonth), monthDate(valueMonth)) : Promise.resolve([]),
    readHireCostAt(valueMonth),
  ]);

  const coverage = await moneyCoverageByMonth(cohortsFrom, valueMonth, lastRun?.daysTo ?? null);
  const rates = isMoneyComplete(coverage) ? await readValueRates(valueMonth) : null;
  const totals =
    rates === null ? null : await readHireCohortTotals(monthDate(cohortsFrom), monthDate(cohortsTo), rates);

  const hiredInMonth = hiredByMonth.find((row) => row.month === valueMonth)?.hired ?? 0;
  // Нанятых в наборах нет — среднего нет: ноль на плитке читался бы как «нанятый ничего не приносит».
  const valuePerHired = totals?.value == null ? null : Math.round(totals.value);

  const cost: DashboardHireCost | null =
    costRow === null
      ? null
      : { amount: costRow.amount, fromMonth: costRow.month, perHired: hireCostPerHired(costRow.amount, hiredInMonth) };

  return {
    month: valueMonth,
    ongoing,
    cohortsFrom,
    cohortsTo,
    coverage,
    valuePerHired,
    hired: totals?.hired ?? null,
    notRode: totals?.notRode ?? null,
    notRodePercent:
      totals === null || totals.hired === 0 ? null : Math.round((totals.notRode / totals.hired) * 100),
    hiredByMonth,
    cost,
    payback: cost === null || valuePerHired === null ? null : hirePaybackOf(valuePerHired, cost.amount, hiredInMonth),
  };
};
