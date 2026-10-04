/**
 * Ответы ручек дашборда метрик (issues #371, #373). Определения метрик — `shared/metrics.ts`.
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

/**
 * Неделя графика «Баллы по неделям» (issue #373): с понедельника по воскресенье по Ташкенту.
 * Выдано может быть меньше нуля — ручные списания вычитаются из выдачи.
 */
export type DashboardPointsWeek = {
  /** Понедельник недели, `YYYY-MM-DD`. */
  weekStart: string;
  issued: number;
  spent: number;
  /** Неделя ещё идёт: её числа вырастут. */
  current: boolean;
};

/** Плитка «Экономика программы» за месяц. Определения — `shared/metrics.ts`. */
export type DashboardProgramEconomy = {
  issued: number;
  spent: number;
  /** Потрачено ÷ выдано, процентом до целого; `null` — ничего не выдано. */
  redemptionPercent: number | null;
  /** Сум за балл на конец периода, за всё время программы; `null` — выданных заказов нет. */
  pointCost: number | null;
  /** Выданных заказов, по которым посчитана цена балла. */
  pointCostOrders: number;
  /** Строк выданных заказов без себестоимости — в цену не вошли. */
  pointCostUnpricedLines: number;
  /** Сумма плюсовых балансов на конец периода. */
  debtPoints: number;
  /** Долг на конец периода минус долг на начало. */
  debtPointsChange: number;
  /** Долг × цена балла; `null` — цены нет. */
  debtSum: number | null;
};

/** Плитка «Вне программы» за месяц: водители на линии без единой привязки Telegram. */
export type DashboardOutsideProgram = {
  drivers: number;
  driversOnLine: number;
  /** Их поездки за период. */
  trips: number;
  /** Все поездки периода. */
  allTrips: number;
};

/** Вкладка «Глубина» за месяц — `GET /api/dashboard/depth?month=YYYY-MM`. */
export type DashboardDepth = {
  month: string;
  /** Месяцы, которые можно выбрать. */
  range: { firstMonth: string; lastMonth: string };
  period: DashboardPeriod;
  /** До 12 недель, последняя — та, в которую входит конец периода. */
  weeks: DashboardPointsWeek[];
  economy: DashboardProgramEconomy;
  outside: DashboardOutsideProgram;
};
