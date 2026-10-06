import { saveDashboardSegment } from '#server/services/metrics/dashboardSegment';
import { readLeadersList } from '#server/services/metrics/listLeadersExport';
import { readMetricsMonth } from '#server/services/metrics/monthPeriod';
import { formatReportDay } from '#server/services/reports/reportTable';
import { formatCalendarDate } from '#server/utils/parkTime';
import { monthYear } from '#shared/monthNames';
import { pluralize } from '#shared/numberFormat';
import type { Segment } from '#shared/types/segment';

/**
 * «Сделать сегмент» у списка «Ездят меньше обычного, перестали или ушли» на «Рычагах» (issue #415).
 *
 * Список — тот же, что на экране и в выгрузке (`readLeadersList`); не строится — `LeadersListError`
 * с тем же текстом. В сегмент — участники программы из его строк (`saveDashboardSegment`).
 *
 * Имя и описание подробные: по сегменту в списке «Сегменты» видно, чьи лидеры, за какой месяц,
 * по каким порогам и когда собран. Пороги — значения констант, которыми считался список.
 */
export const createLeadersSegment = async (
  monthParam: unknown,
  employeeId: string,
  now: Date = new Date(),
): Promise<Segment> => {
  const month = readMetricsMonth(monthParam, now);
  const { dashboard, rows } = await readLeadersList(month, now);
  const { leadersMonth, week, thresholds } = dashboard;
  const leaders = `Лидеры ${monthYear(leadersMonth, 'genitive')}`;
  const weeks = (count: number): string => `${count} ${pluralize(count, 'неделю', 'недели', 'недель')}`;

  const about = [
    `Дашборд → Рычаги, список „Ездят меньше обычного, перестали, ушли“ за ${monthYear(month, 'nominative')}.`,
    `${leaders} — верхние ${thresholds.leadersPercent} % водителей по поездкам.`,
    `Ездят меньше обычного — ${weeks(thresholds.streakMinWeeks)} подряд ниже нормы на ${thresholds.belowNormPercent} % и больше; норма — медиана поездок в неделю за ${weeks(thresholds.normWeeks)}.`,
    `Состояние — на неделю ${formatReportDay(week.from)}–${formatReportDay(week.to)}.`,
  ].join(' ');

  return saveDashboardSegment({
    list: 'leaders',
    month,
    rows,
    name: `${leaders}: ездят меньше обычного, перестали, ушли — на ${formatCalendarDate(now)}`,
    about,
    employeeId,
    now,
  });
};
