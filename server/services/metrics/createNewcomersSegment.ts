import { saveDashboardSegment } from '#server/services/metrics/dashboardSegment';
import { readNewcomersList } from '#server/services/metrics/listNewcomersExport';
import { readMetricsMonth } from '#server/services/metrics/monthPeriod';
import { formatReportDay } from '#server/services/reports/reportTable';
import { formatCalendarDate } from '#server/utils/parkTime';
import { monthYear } from '#shared/monthNames';
import type { Segment } from '#shared/types/segment';

/**
 * «Сделать сегмент» у списка «Новички {месяца}: меньше 20 поездок за 14 дней» на «Глубине»
 * (issue #415).
 *
 * Список — тот же, что на экране и в выгрузке (`readNewcomersList`); не строится —
 * `NewcomersListError` с тем же текстом. В сегмент — участники программы из его строк
 * (`saveDashboardSegment`).
 *
 * Имя и описание подробные: чей набор, по каким порогам, на какой день и когда собран.
 * Пороги — значения констант, которыми считался список.
 */
export const createNewcomersSegment = async (
  monthParam: unknown,
  employeeId: string,
  now: Date = new Date(),
): Promise<Segment> => {
  const month = readMetricsMonth(monthParam, now);
  const { dashboard, rows } = await readNewcomersList(month, now);
  const { firstDays, tripsTarget } = dashboard.thresholds;
  const list = `Новички ${monthYear(month, 'genitive')}: меньше ${tripsTarget} поездок за ${firstDays} дней`;

  const about = [
    `Дашборд → Глубина, список „${list}“.`,
    `Новичок — первая завершённая поездка в истории парка пришлась на ${monthYear(month, 'nominative')}; ${firstDays} дней — день первой поездки и ${firstDays - 1} следующих.`,
    `На ${formatReportDay(dashboard.asOfDay)}.`,
  ].join(' ');

  return saveDashboardSegment({
    list: 'newcomers',
    month,
    rows,
    name: `${list} — на ${formatCalendarDate(now)}`,
    about,
    employeeId,
    now,
  });
};
