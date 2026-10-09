import { readPersonMonthRateTotals, type PersonMonthPricing } from '#server/repositories/metrics';
import { MONEY_FIRST_DAY, PARK_NEWCOMER_RATE_TERMS } from '#server/services/metrics/constants';
import { wholeMonthPeriod } from '#server/services/metrics/monthPeriod';
import { formatDayKey } from '#server/utils/parkTime';
import { shiftMonth } from '#shared/monthNames';
import type { DashboardPeriod } from '#shared/types/dashboard';

/**
 * Цена человека в месяце по нынешним ставкам — общая для «Цены водителя за год» (issue #442)
 * и «Окупается ли найм» (issue #445): docs/decisions.md → «Цена водителя на дашборде»
 * и «Окупаемость найма на дашборде». Двух разных цен одного человека на одном экране быть
 * не должно, поэтому месяц плитки, окно наборов и ставки считаются здесь один раз.
 *
 * Сама цена человека в месяце — выражение SQL в репозитории (`personMonthValueSql`): суммируется
 * она в запросах, а не здесь.
 */

export const FIRST_MONEY_MONTH = MONEY_FIRST_DAY.slice(0, 7);

export const YEAR_MONTHS = 12;

/** Первое число месяца — так месяц лежит в таблице. */
export const monthDate = (month: string): string => `${month}-01`;

export const laterMonth = (first: string, second: string): string => (first > second ? first : second);

/** Собраны все сутки каждого месяца — иначе пропуск дал бы ушедшему нули. */
export const isMoneyComplete = (coverage: readonly DashboardPeriod[]): boolean =>
  coverage.every((period) => period.coveredDays >= period.days);

/** Месяц плитки: закрытый — выбранный, идущий — прошлый. */
export type ValueMonth = {
  month: string;
  /** Выбран идущий месяц — плитка показывает последний закрытый. */
  ongoing: boolean;
};

export const valueMonthOf = (month: string, now: Date): ValueMonth => {
  const ongoing = month >= formatDayKey(now).slice(0, 7);

  return { month: ongoing ? shiftMonth(month, -1) : month, ongoing };
};

/** Наборы «за год» плитки месяца `T`: `T − 23 … T − 12`, не раньше первого месяца денег. */
export const yearCohorts = (valueMonth: string): { from: string; to: string } => ({
  from: laterMonth(shiftMonth(valueMonth, -(2 * YEAR_MONTHS - 1)), FIRST_MONEY_MONTH),
  to: shiftMonth(valueMonth, -YEAR_MONTHS),
});

type NewcomerRateTerm = (typeof PARK_NEWCOMER_RATE_TERMS)[number];

/** Условия ставки новичка месяца и последние ли они в списке. */
export type MonthNewcomerRateTerm = { term: NewcomerRateTerm; latest: boolean };

/** Условия месяца — последние с `hiredFrom` не позже его последнего дня. */
export const newcomerRateTermOf = (month: string): MonthNewcomerRateTerm => {
  const lastDay = wholeMonthPeriod(month).to;
  const index = PARK_NEWCOMER_RATE_TERMS.findLastIndex((term) => term.hiredFrom === null || term.hiredFrom <= lastDay);
  const term = PARK_NEWCOMER_RATE_TERMS[index];

  if (term === undefined) {
    throw new Error(`Нет условий ставки новичка на ${month}`);
  }

  return { term, latest: index === PARK_NEWCOMER_RATE_TERMS.length - 1 };
};

/**
 * Цена по условиям месяца: ставки — из его данных, окно — его условий
 * (docs/decisions.md → «Цена водителя на дашборде»).
 *
 * Основная = комиссия ÷ оплата вне фактического окна заказов. Новичка — по заказам условий
 * месяца: у месяца с последними условиями и оплатой новичков этих условий — только по ним
 * (`…_latest`), иначе — по всему фактическому окну; оплаты новичков нет — ставка новичка равна
 * основной. Оплаты вне окна новичка нет — цены нет.
 */
export const readValueRates = async (month: string): Promise<PersonMonthPricing | null> => {
  const { term, latest } = newcomerRateTermOf(month);
  const totals = await readPersonMonthRateTotals(monthDate(month));
  const mainPayment = totals.payment - totals.paymentNewcomerRate;

  if (mainPayment <= 0) return null;

  const main = (totals.fee - totals.feeNewcomerRate) / mainPayment;
  const newcomer =
    latest && totals.paymentNewcomerRateLatest > 0
      ? totals.feeNewcomerRateLatest / totals.paymentNewcomerRateLatest
      : totals.paymentNewcomerRate > 0
        ? totals.feeNewcomerRate / totals.paymentNewcomerRate
        : main;

  return { rates: { main, newcomer }, windowDays: term.days };
};
