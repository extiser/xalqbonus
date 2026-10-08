import { readLastMetricMoneyRun, readMetricMoneyTotals, type MetricMoneyTotals } from '#server/repositories/metrics';
import { moneyConclusion } from '#server/services/metrics/conclusions';
import { decomposeProduct } from '#server/services/metrics/decomposeMultipliers';
import { withMoneyCoverage } from '#server/services/metrics/moneyCoverage';
import {
  metricsMonthRange,
  moneyPeriods,
  readMetricsMonth,
  wholeMonthPeriod,
  type MonthPeriodDays,
} from '#server/services/metrics/monthPeriod';
import { periodMonthWord, shiftMonth } from '#shared/monthNames';
import type {
  DashboardMoney,
  DashboardMoneyComparison,
  DashboardMoneyMonth,
  DashboardMoneyValues,
  DashboardPeriod,
} from '#shared/types/dashboard';

/**
 * Вкладка «Деньги» дашборда за месяц (issue #438): доход парка, почему он изменился к тому же
 * месяцу год назад и к прошлому месяцу, и доход по месяцам за год — docs/decisions.md → «Деньги
 * на дашборде». Читает только готовую таблицу `metric_money_days`: транзакции на открытии экрана
 * не читаются никогда.
 *
 * Доход = заказы × оплата на заказ × комиссия парка, ровно: доход округляется до сума, а комиссия
 * считается от округлённого. Вклады множителей — то же логарифмическое разложение, что у поездок
 * (`decomposeMultipliers.ts`), в сумах целым.
 *
 * Месяц приходит из запроса как есть; негодный — `MetricsMonthError` (`monthPeriod.ts`).
 */

/** Столбцов на графике по месяцам: выбранный и двенадцать до него. */
const BY_MONTH_COUNT = 13;

const MONEY_FACTOR_KEYS = ['orders', 'paymentPerOrder', 'commission'] as const;

/**
 * Значения периода целиком (`divisor` = 1) или в сутки (`divisor` — суток периода). Доход —
 * целым сумом, остальное — как посчитано; оплата на заказ от деления не зависит.
 */
const moneyValues = (totals: MetricMoneyTotals, divisor: number): DashboardMoneyValues => {
  const income = Math.round(totals.income / divisor);
  const orders = totals.orders / divisor;
  const payment = totals.payment / divisor;

  return {
    income,
    orders,
    paymentPerOrder: totals.orders > 0 ? totals.payment / totals.orders : 0,
    commission: payment > 0 ? income / payment : 0,
    incomePerOrder: orders > 0 ? income / orders : 0,
  };
};

type BaseWords = { toBase: string; inBase: string };

const isComplete = (period: DashboardPeriod): boolean => period.coveredDays >= period.days;

const compare = (
  period: DashboardPeriod,
  totals: MetricMoneyTotals,
  basePeriod: DashboardPeriod,
  baseTotals: MetricMoneyTotals,
  perDay: boolean,
  words: BaseWords,
): DashboardMoneyComparison => {
  const current = moneyValues(totals, perDay ? Math.max(period.days, 1) : 1);
  const base = baseTotals.orders > 0 ? moneyValues(baseTotals, perDay ? Math.max(basePeriod.days, 1) : 1) : null;
  const contributions = base === null ? null : decomposeProduct(current, base, 'income', MONEY_FACTOR_KEYS);

  return {
    basePeriod,
    perDay,
    current,
    base,
    contributions,
    conclusion: moneyConclusion({
      current,
      base,
      contributions,
      perDay,
      ...words,
      periodComplete: isComplete(period),
      baseComplete: isComplete(basePeriod),
    }),
  };
};

/** «к сентябрю 2025», «в 1–8 октября 2025» — база год назад с годом. */
const yearWords = (period: DashboardPeriod): BaseWords => {
  const year = period.from.slice(0, 4);

  return {
    toBase: `к ${periodMonthWord(period, 'dative')} ${year}`,
    inBase: `в ${periodMonthWord(period, 'prepositional')} ${year}`,
  };
};

/** «к августу», «в 1–8 сентября» — прошлый месяц. */
const monthWords = (period: DashboardPeriod): BaseWords => ({
  toBase: `к ${periodMonthWord(period, 'dative')}`,
  inBase: `в ${periodMonthWord(period, 'prepositional')}`,
});

const readMonthColumn = async (
  period: MonthPeriodDays,
  lastComputedDay: string | null,
): Promise<DashboardMoneyMonth> => {
  const [covered, totals] = await Promise.all([
    withMoneyCoverage(period, lastComputedDay),
    readMetricMoneyTotals(period.from, period.to),
  ]);

  return {
    month: period.from.slice(0, 7),
    income: Math.round(totals.income),
    days: covered.days,
    coveredDays: covered.coveredDays,
    partial: covered.partial,
  };
};

export const readDashboardMoney = async (monthParam: unknown, now: Date = new Date()): Promise<DashboardMoney> => {
  const month = readMetricsMonth(monthParam, now);
  const lastRun = await readLastMetricMoneyRun();
  const lastComputedDay = lastRun?.daysTo ?? null;
  const periods = moneyPeriods(month, now, lastComputedDay);

  const columnPeriods = Array.from({ length: BY_MONTH_COUNT }, (_, index) => {
    const columnMonth = shiftMonth(month, index - (BY_MONTH_COUNT - 1));

    return columnMonth === month ? periods.period : wholeMonthPeriod(columnMonth);
  });

  const [period, yearBase, monthBase, totals, yearTotals, monthTotals, byMonth] = await Promise.all([
    withMoneyCoverage(periods.period, lastComputedDay),
    withMoneyCoverage(periods.yearBase, lastComputedDay),
    withMoneyCoverage(periods.monthBase, lastComputedDay),
    readMetricMoneyTotals(periods.period.from, periods.period.to),
    readMetricMoneyTotals(periods.yearBase.from, periods.yearBase.to),
    readMetricMoneyTotals(periods.monthBase.from, periods.monthBase.to),
    Promise.all(columnPeriods.map((column) => readMonthColumn(column, lastComputedDay))),
  ]);

  return {
    month,
    range: metricsMonthRange(now),
    computedAt: lastRun?.finishedAt.toISOString() ?? null,
    period,
    income: Math.round(totals.income),
    orders: totals.orders,
    payment: Math.round(totals.payment),
    bases: {
      // Год к году — целиком; в сутки, только когда суток разное число: февраль високосного года.
      year: compare(period, totals, yearBase, yearTotals, period.days !== yearBase.days, yearWords(yearBase)),
      // К прошлому месяцу — всегда в сутки: месяцы разной длины целиком не сравниваются.
      month: compare(period, totals, monthBase, monthTotals, true, monthWords(monthBase)),
    },
    byMonth,
  };
};
