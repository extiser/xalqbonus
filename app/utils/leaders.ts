import { pluralize } from '~/utils/format';
import { monthForms, monthYear, shiftMonth } from '#shared/monthNames';
import type { MetricValues } from '#shared/metrics';
import type { DashboardLeaders, DashboardLeadersThresholds, DashboardPeriod } from '#shared/types/dashboard';

/**
 * Подписи блока лидеров на «Рычагах» (issue #402) — общие для трёх плиток и списка: строки
 * «чьи это лидеры», «лидеров нет», «не считаем». Тексты — макеты `02-levers.html`,
 * `02-levers-first-month.html`, `02-levers-leaders-incomplete.html`, `02-levers-leaders-empty.html`.
 */

const weeks = (count: number): string => `${count} ${pluralize(count, 'неделю', 'недели', 'недель')}`;

/** «3+ недели» — порог серии, как в строке плитки. */
export const streakPlusLabel = (thresholds: DashboardLeadersThresholds): string =>
  `${thresholds.streakMinWeeks}+ ${pluralize(thresholds.streakMinWeeks, 'неделя', 'недели', 'недель')}`;

/** Подстановки порогов в подсказки (`shared/metrics.ts`): значения — константы сервера из ответа ручки. */
export const leadersMetricValues = (thresholds: DashboardLeadersThresholds): MetricValues => ({
  leadersPercent: String(thresholds.leadersPercent),
  normWeeks: weeks(thresholds.normWeeks),
  belowNormPercent: String(thresholds.belowNormPercent),
  streakWeeks: weeks(thresholds.streakMinWeeks),
  streakPlus: streakPlusLabel(thresholds),
});

/** «ниже своей нормы на 30 % и больше» — начало строки порога. */
export const belowNormLabel = (thresholds: DashboardLeadersThresholds): string =>
  `ниже своей нормы на ${thresholds.belowNormPercent} % и больше`;

/**
 * Первый месяц истории: «Лидеров за сентябрь 2025 нет: история заказов — с октября 2025.
 * Лидеры октября появятся в ноябре 2025.»
 */
export const noLeadersText = (leaders: DashboardLeaders, firstMonth: string): string => {
  const month = shiftMonth(leaders.leadersMonth, 1);

  return `Лидеров за ${monthYear(leaders.leadersMonth, 'nominative')} нет: история заказов — с ${monthYear(firstMonth, 'genitive')}. Лидеры ${monthForms(month).genitive} появятся в ${monthYear(shiftMonth(month, 1), 'prepositional')}.`;
};

/** «Список — с ноября 2025.» — когда появится список у первого месяца истории. */
export const listFromText = (leaders: DashboardLeaders): string =>
  `Список — с ${monthYear(shiftMonth(leaders.leadersMonth, 2), 'genitive')}.`;

/** Месяцы, в которых собраны не все сутки, — родительным: «июля и августа». */
export const incompleteMonthsText = (coverage: readonly DashboardPeriod[]): string => {
  const months = [
    ...new Set(coverage.filter((period) => period.coveredDays < period.days).map((period) => period.from.slice(0, 7))),
  ]
    .sort()
    .map((month) => monthForms(month).genitive);

  return months.length < 2 ? (months[0] ?? '') : `${months.slice(0, -1).join(', ')} и ${months.at(-1)}`;
};

/** «в июле собрано 9 суток из 31», с несколькими месяцами — «…, в августе — 0 из 31». */
export const collectedText = (coverage: readonly DashboardPeriod[]): string =>
  coverage
    .filter((period) => period.coveredDays < period.days)
    .map((period, index) => {
      const month = monthForms(period.from).prepositional;

      return index === 0
        ? `в ${month} собрано ${period.coveredDays} ${pluralize(period.coveredDays, 'сутки', 'суток', 'суток')} из ${period.days}`
        : `в ${month} — ${period.coveredDays} из ${period.days}`;
    })
    .join(', ');

/** «Лидеры сентября» — чьи это лидеры. */
export const leadersOf = (month: string): string => `Лидеры ${monthForms(month).genitive}`;

/** «на сегодня» у идущего месяца, «на 31 мая» — у закрытого. */
export const asOfText = (leaders: DashboardLeaders): string =>
  leaders.ongoing
    ? 'на сегодня'
    : `на ${Number(leaders.asOfDay.slice(8, 10))} ${monthForms(leaders.asOfDay).genitive}`;

/** «28.09» — день `YYYY-MM-DD` без года. */
export const formatShortDay = (day: string): string => `${day.slice(8, 10)}.${day.slice(5, 7)}`;
