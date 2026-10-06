import { pluralize } from '~/utils/format';
import { monthForms, shiftMonth } from '#shared/monthNames';
import type { MetricValues } from '#shared/metrics';
import type { DashboardNewcomers, DashboardNewcomersThresholds } from '#shared/types/dashboard';

/**
 * Подписи новичков на «Глубине» (issue #407) — общие для двух плиток и списка. Тексты — эталон
 * `_reference/design/web/dashboard/03-depth-newbies.html` и лист состояний
 * `03-depth-newbies-states.html` с подставленными месяцами и числами.
 */

/** Подстановки окна, порога и границы точных наборов в подсказки (`shared/metrics.ts`). */
export const newcomersMetricValues = (thresholds: DashboardNewcomersThresholds): MetricValues => ({
  newcomerDays: String(thresholds.firstDays),
  newcomerDaysAfter: String(thresholds.firstDays - 1),
  newcomerTrips: String(thresholds.tripsTarget),
  newcomersExactFrom: monthYear(thresholds.exactFromMonth, 'genitive'),
});

/** «октября 2025», «в октябре 2025» — месяц с годом в нужном падеже. */
export const monthYear = (month: string, form: 'nominative' | 'genitive' | 'prepositional'): string =>
  `${monthForms(month)[form]} ${month.slice(0, 4)}`;

/** «14 октября» — день `YYYY-MM-DD` словом. */
export const dayWord = (day: string): string => `${Number(day.slice(8, 10))} ${monthForms(day).genitive}`;

/** Доля целым процентом; делить не на что — `null`. */
export const percentOf = (part: number, whole: number): number | null =>
  whole === 0 ? null : Math.round((part / whole) * 100);

/** «Сентябрь — последний закрытый месяц; октябрь ещё идёт» — у идущего месяца. */
export const ongoingNote = (newcomers: DashboardNewcomers, month: string): string | null => {
  if (!newcomers.ongoing) return null;

  const closed = monthForms(newcomers.curveMonth).nominative;

  return `${closed.charAt(0).toUpperCase()}${closed.slice(1)} — последний закрытый месяц; ${monthForms(month).nominative} ещё идёт`;
};

/**
 * Первый месяц истории: «Новичков в октябре 2025 нет: история заказов — с октября 2025».
 * Продолжение у каждого элемента своё.
 */
export const noNewcomersText = (month: string): string =>
  `Новичков в ${monthYear(month, 'prepositional')} нет: история заказов — с ${monthYear(month, 'genitive')}`;

/** «Кривая — с декабря 2025»: первая точка — первый набор через месяц. */
export const curveFromText = (newcomers: DashboardNewcomers): string =>
  `Кривая — с ${monthYear(shiftMonth(newcomers.firstCohortMonth, 1), 'genitive')}`;

/** «через 6 месяцев» */
export const monthsLater = (count: number): string =>
  `через ${count} ${pluralize(count, 'месяц', 'месяца', 'месяцев')}`;

/** «Новички апреля: меньше 20 поездок за 14 дней — поимённо»; у первого месяца истории — с годом. */
export const listTitle = (newcomers: DashboardNewcomers | null, month: string | null): string => {
  if (!newcomers || !month) return 'Новички: поимённо';

  const { tripsTarget, firstDays } = newcomers.thresholds;
  const who = newcomers.noNewcomers ? monthYear(month, 'genitive') : monthForms(month).genitive;

  return `Новички ${who}: меньше ${tripsTarget} поездок за ${firstDays} дней — поимённо`;
};
