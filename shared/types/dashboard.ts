/**
 * Ответы ручек дашборда метрик (issue #371). Определения метрик — `shared/metrics.ts`.
 *
 * Даты — строки `YYYY-MM-DD`, месяцы — `YYYY-MM`: сутки и месяц метрик календарные
 * по Ташкенту, и зона показа сдвигать их не должна.
 */

/** Период сравнения: сутки `from`–`to` включительно. */
export type DashboardPeriod = {
  from: string;
  to: string;
  /** Сколько суток в периоде. */
  days: number;
  /** Сколько из них собрано полностью; меньше `days` — цифры занижены. */
  coveredDays: number;
  /** Период короче своего месяца: текущий месяц по вчера или столько же первых суток прошлого. */
  partial: boolean;
};

/**
 * Множители поездок: `trips = driversOnLine × daysOnLine × tripsPerDay`. Дни на линии
 * и поездки в день — дробные, как посчитаны; округляет экран.
 */
export type DashboardMultipliers = {
  trips: number;
  driversOnLine: number;
  daysOnLine: number;
  tripsPerDay: number;
};

/**
 * Сколько поездок прибавил или отнял каждый множитель. Целые, в сумме ровно `total` —
 * изменение поездок к базе.
 */
export type DashboardContributions = {
  driversOnLine: number;
  daysOnLine: number;
  tripsPerDay: number;
  total: number;
};

/** Вкладка «Рычаги» за месяц — `GET /api/dashboard/levers?month=YYYY-MM`. */
export type DashboardLevers = {
  month: string;
  /** Месяцы, которые можно выбрать. */
  range: { firstMonth: string; lastMonth: string };
  period: DashboardPeriod;
  basePeriod: DashboardPeriod;
  current: DashboardMultipliers;
  /** `null` — в базовом периоде поездок нет, сравнивать не с чем. */
  base: DashboardMultipliers | null;
  /** `null` — поездок нет в одном из периодов: разложения нет. */
  contributions: DashboardContributions | null;
  /** Когда кончился последний успешный пересчёт; `null` — ещё не считали. */
  computedAt: string | null;
};
