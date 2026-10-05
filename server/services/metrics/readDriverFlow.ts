import { readDriverFlowByMonth } from '#server/repositories/metrics';
import { driverFlowConclusion } from '#server/services/metrics/conclusions';
import { FLOW_NEW_EXACT_FROM, METRICS_FIRST_DAY } from '#server/services/metrics/constants';
import { wholeMonthPeriod } from '#server/services/metrics/monthPeriod';
import { withCoverage } from '#server/services/metrics/periodCoverage';
import { formatDayKey } from '#server/utils/parkTime';
import { shiftMonth } from '#shared/monthNames';
import type { DashboardDriverFlow, DashboardFlowMonth, DashboardPeriod } from '#shared/types/dashboard';

/**
 * Поток водителей по месяцам на вкладке «Рычаги» (issue #392) — growth accounting по календарному
 * месяцу из готовой таблицы (docs/decisions.md → «Поток водителей — по календарному месяцу»).
 *
 * Считаются только закрытые месяцы — раньше текущего по Ташкенту: в идущем «ушли» — все, кто
 * ещё не успел выйти на линию. Выбран идущий — панель показывает последний закрытый. У первого
 * месяца метрик потока нет: прошлого месяца нет; вместо потока — его водители на линии.
 *
 * Месяц неполный, если не все сутки собраны у него или у прошлого: «ушли» смотрят оба.
 *
 * Вывод словами (issue #398) — о месяце панели: в идущем — о последнем закрытом.
 */

/** Сколько месяцев на графике. */
const CHART_MONTHS = 6;

const FIRST_MONTH = METRICS_FIRST_DAY.slice(0, 7);

/** Первый месяц потока — у первого месяца метрик прошлого нет. */
const FIRST_FLOW_MONTH = shiftMonth(FIRST_MONTH, 1);

const EXACT_FROM_MONTH = FLOW_NEW_EXACT_FROM.slice(0, 7);

/** Месяцы `from`–`to` включительно, от старых к новым. */
const monthsBetween = (from: string, to: string): string[] => {
  const months: string[] = [];

  for (let month = from; month <= to; month = shiftMonth(month, 1)) {
    months.push(month);
  }

  return months;
};

const readCoverage = async (months: readonly string[]): Promise<Map<string, DashboardPeriod>> => {
  const entries = await Promise.all(
    months.map(async (month) => [month, await withCoverage(wholeMonthPeriod(month))] as const),
  );

  return new Map(entries);
};

export const readDriverFlow = async (month: string, now: Date = new Date()): Promise<DashboardDriverFlow> => {
  const currentMonth = formatDayKey(now).slice(0, 7);
  const selectedOngoing = month >= currentMonth;
  const panelMonth = selectedOngoing ? shiftMonth(month, -1) : month;

  if (panelMonth < FIRST_FLOW_MONTH) {
    const [first] = month === FIRST_MONTH ? await readDriverFlowByMonth(FIRST_MONTH, FIRST_MONTH) : [];

    return { months: [], panel: null, selectedOngoing, firstMonthOnLine: first?.onLine ?? null, conclusion: null };
  }

  const chartStart = shiftMonth(panelMonth, 1 - CHART_MONTHS);
  const fromMonth = chartStart < FIRST_FLOW_MONTH ? FIRST_FLOW_MONTH : chartStart;
  const [rows, coverage] = await Promise.all([
    readDriverFlowByMonth(fromMonth, panelMonth),
    readCoverage(monthsBetween(shiftMonth(fromMonth, -1), panelMonth)),
  ]);

  const months = rows.map((row): DashboardFlowMonth => {
    const periods = [shiftMonth(row.month, -1), row.month].map((periodMonth) => {
      const period = coverage.get(periodMonth);

      if (!period) {
        throw new Error(`нет покрытия месяца ${periodMonth}`);
      }

      return period;
    });

    return {
      ...row,
      onLineChange: row.newDrivers + row.returned - row.left,
      earlyHistory: row.month < EXACT_FROM_MONTH,
      incomplete: periods.some((period) => period.coveredDays < period.days),
      coverage: periods,
    };
  });

  const panel = months.at(-1) ?? null;
  const conclusion =
    panel === null
      ? null
      : driverFlowConclusion({
          newDrivers: panel.newDrivers,
          returned: panel.returned,
          left: panel.left,
          previousOnLine: panel.onLine - panel.onLineChange,
          earlyHistory: panel.earlyHistory,
          incomplete: panel.incomplete,
        });

  return { months, panel, selectedOngoing, firstMonthOnLine: null, conclusion };
};
