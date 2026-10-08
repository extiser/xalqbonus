import { METRICS_FIRST_DAY } from '#server/services/metrics/constants';
import { formatDayKey, shiftDayKey } from '#server/utils/parkTime';
import { shiftMonth } from '#shared/monthNames';

/**
 * Месяц дашборда и его периоды сравнения (issue #371). Месяц — календарный, по Ташкенту.
 *
 * Прошедший месяц берётся целиком и сравнивается с прошлым целиком. Текущий — с первого
 * числа по вчерашние сутки, `k` суток, и сравнивается с теми же `k` первыми сутками прошлого
 * месяца; в прошлом месяце суток меньше — со всем прошлым. Первого числа за текущий месяц
 * данных ещё нет, и последним доступным месяцем стоит прошлый.
 */

/** Негодный месяц в запросе. Текст — готовый ответ человеку. */
export class MetricsMonthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetricsMonthError';
  }
}

/** Сутки `from`–`to` включительно и полнота относительно своего месяца. */
export type MonthPeriodDays = {
  from: string;
  to: string;
  days: number;
  partial: boolean;
};

export type MonthPeriods = {
  period: MonthPeriodDays;
  basePeriod: MonthPeriodDays;
};

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Сколько суток в месяце `YYYY-MM`. День ноль следующего месяца — последний день этого. */
const monthLength = (month: string): number => {
  const [year, monthNumber] = month.split('-').map(Number);

  return new Date(Date.UTC(year ?? 0, monthNumber ?? 0, 0)).getUTCDate();
};

const dayOfMonth = (month: string, day: number): string => `${month}-${String(day).padStart(2, '0')}`;

/** Вчерашние сутки по Ташкенту — последние посчитанные. */
const yesterdayOf = (now: Date): string => shiftDayKey(formatDayKey(now), -1);

/**
 * Месяцы, которые можно выбрать: с месяца первых суток истории по месяц вчерашних суток —
 * текущий, а первого числа прошлый.
 */
export const metricsMonthRange = (now: Date): { firstMonth: string; lastMonth: string } => ({
  firstMonth: METRICS_FIRST_DAY.slice(0, 7),
  lastMonth: yesterdayOf(now).slice(0, 7),
});

/**
 * Месяц из запроса. Не задан — последний доступный. Не в формате или вне диапазона — отказ.
 */
export const readMetricsMonth = (value: unknown, now: Date): string => {
  const { firstMonth, lastMonth } = metricsMonthRange(now);

  if (value === undefined || value === '') {
    return lastMonth;
  }

  if (typeof value !== 'string' || !MONTH_PATTERN.test(value)) {
    throw new MetricsMonthError('Месяц — в виде ГГГГ-ММ.');
  }

  if (value < firstMonth || value > lastMonth) {
    throw new MetricsMonthError(`Месяц — с ${firstMonth} по ${lastMonth}.`);
  }

  return value;
};

/** Месяц `YYYY-MM` целиком: поток водителей считается только по закрытым месяцам. */
export const wholeMonthPeriod = (month: string): MonthPeriodDays => {
  const days = monthLength(month);

  return { from: dayOfMonth(month, 1), to: dayOfMonth(month, days), days, partial: false };
};

/**
 * Первые `days` суток месяца. Ноль суток — пустой период: `to` раньше `from`, и запрос
 * за такие сутки ничего не находит.
 */
const firstDaysOf = (month: string, days: number): MonthPeriodDays => {
  const from = dayOfMonth(month, 1);

  return {
    from,
    to: days > 0 ? dayOfMonth(month, days) : shiftDayKey(from, -1),
    days,
    partial: days < monthLength(month),
  };
};

/**
 * База сравнения для периода из `days` первых суток месяца — месяц на `shift` назад. Прошедший
 * месяц — и тот, что кончился вчера, — сравнивается с базой целиком, даже если та длиннее:
 * ноябрь — со всем октябрём. Идущий — с теми же первыми сутками, сколько их есть в базе.
 */
const basePeriodOf = (month: string, days: number, shift: number): MonthPeriodDays => {
  const baseMonth = shiftMonth(month, shift);
  const baseLength = monthLength(baseMonth);

  return firstDaysOf(baseMonth, days === monthLength(month) ? baseLength : Math.min(days, baseLength));
};

/** Период месяца и база сравнения. Месяц уже проверен `readMetricsMonth`. */
export const monthPeriods = (month: string, now: Date): MonthPeriods => {
  const yesterday = yesterdayOf(now);
  const days = yesterday.slice(0, 7) === month ? Number(yesterday.slice(8, 10)) : monthLength(month);

  return { period: firstDaysOf(month, days), basePeriod: basePeriodOf(month, days, -1) };
};

/** Период вкладки «Деньги» и две её базы сравнения. */
export type MoneyPeriods = {
  period: MonthPeriodDays;
  /** Тот же месяц год назад. */
  yearBase: MonthPeriodDays;
  /** Прошлый месяц. */
  monthBase: MonthPeriodDays;
};

/**
 * Периоды вкладки «Деньги» (issue #438). Закрытый месяц — целиком; идущий — с первого числа
 * по последние сутки, которые таблица денег уже посчитала, но не позже вчерашних: до ночного
 * пересчёта это позавчера, и экран не говорит «собраны не все сутки» каждую ночь. Посчитанных
 * суток месяца ещё нет — в периоде ноль суток (docs/decisions.md → «Деньги на дашборде»).
 *
 * Базы — тот же месяц год назад и прошлый месяц, теми же правилами, что у `monthPeriods`.
 * `lastComputedDay` — последние сутки успешного прогона денег; `null` — прогона не было.
 */
export const moneyPeriods = (month: string, now: Date, lastComputedDay: string | null): MoneyPeriods => {
  const yesterday = yesterdayOf(now);
  let days = monthLength(month);

  if (yesterday.slice(0, 7) === month) {
    const lastDay = lastComputedDay !== null && lastComputedDay < yesterday ? lastComputedDay : yesterday;

    days = lastComputedDay !== null && lastDay.slice(0, 7) === month ? Number(lastDay.slice(8, 10)) : 0;
  }

  return {
    period: firstDaysOf(month, days),
    yearBase: basePeriodOf(month, days, -12),
    monthBase: basePeriodOf(month, days, -1),
  };
};
