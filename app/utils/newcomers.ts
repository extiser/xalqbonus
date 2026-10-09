import { pluralize } from '~/utils/format';
import { monthForms, monthYear, shiftMonth } from '#shared/monthNames';
import type { MetricValues } from '#shared/metrics';
import type { DashboardNewcomers, DashboardNewcomersThresholds } from '#shared/types/dashboard';

/**
 * Подписи новичков на «Глубине» (issue #407) — общие для двух плиток и списка. Тексты — эталон
 * `_reference/design/web/dashboard/03-depth-newbies.html` и лист состояний
 * `03-depth-newbies-states.html` с подставленными месяцами и числами. Причины, по которым список
 * не строится, — в `shared/newcomers.ts`: их же отдаёт отказ выгрузки.
 */

/** Подстановки окна и порога в подсказки (`shared/metrics.ts`). */
export const newcomersMetricValues = (thresholds: DashboardNewcomersThresholds): MetricValues => ({
  newcomerDays: String(thresholds.firstDays),
  newcomerDaysAfter: String(thresholds.firstDays - 1),
  newcomerTrips: String(thresholds.tripsTarget),
});

/** Доля целым процентом; делить не на что — `null`. */
export const percentOf = (part: number, whole: number): number | null =>
  whole === 0 ? null : Math.round((part / whole) * 100);

/**
 * «Сентябрь — последний закрытый месяц; октябрь ещё идёт» — у идущего месяца, под названием
 * плитки, которая показывает последний закрытый: новички и цена водителя (issue #442).
 */
export const ongoingNote = (ongoing: boolean, closedMonth: string, month: string): string | null => {
  if (!ongoing) return null;

  const closed = monthForms(closedMonth).nominative;

  return `${closed.charAt(0).toUpperCase()}${closed.slice(1)} — последний закрытый месяц; ${monthForms(month).nominative} ещё идёт`;
};

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
