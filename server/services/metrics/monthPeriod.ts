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

/** Период месяца и база сравнения. Месяц уже проверен `readMetricsMonth`. */
export const monthPeriods = (month: string, now: Date): MonthPeriods => {
  const yesterday = yesterdayOf(now);
  const length = monthLength(month);
  const days = yesterday.slice(0, 7) === month ? Number(yesterday.slice(8, 10)) : length;

  const baseMonth = shiftMonth(month, -1);
  const baseLength = monthLength(baseMonth);
  // Прошедший месяц — и тот, что кончился вчера, — сравнивается с прошлым целиком, даже если
  // тот длиннее: ноябрь — со всем октябрём.
  const baseDays = days === length ? baseLength : Math.min(days, baseLength);

  return {
    period: { from: dayOfMonth(month, 1), to: dayOfMonth(month, days), days, partial: days < length },
    basePeriod: {
      from: dayOfMonth(baseMonth, 1),
      to: dayOfMonth(baseMonth, baseDays),
      days: baseDays,
      partial: baseDays < baseLength,
    },
  };
};
