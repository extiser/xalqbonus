import { readFirstDriverTransferDay, sumPointFlowsByWeek } from '#server/repositories/metrics';
import { POINT_FLOW_REASONS } from '#server/services/metrics/pointFlows';
import { calendarDayMoment, formatDayKey, shiftDayKey } from '#server/utils/parkTime';
import type { DashboardPointsWeek } from '#shared/types/dashboard';

/**
 * График «Баллы по неделям» (issue #373): выдано и потрачено за неделю с понедельника
 * по воскресенье по Ташкенту.
 *
 * Недель — до 12. Последняя — та, в которую входит конец периода; первая — не раньше недели
 * первого перевода в журнале: до него недель нет, а не «ноль баллов». Неделя, которая ещё
 * идёт, считается по сей момент и помечена `current`.
 */

const WEEKS_LIMIT = 12;

/** Понедельник недели дня `YYYY-MM-DD`. Календарная арифметика, зона не участвует. */
export const weekStartOf = (day: string): string => {
  const isoWeekday = calendarDayMoment(day).getUTCDay() || 7;

  return shiftDayKey(day, 1 - isoWeekday);
};

export const readPointsWeekly = async (
  periodTo: string,
  now: Date = new Date(),
): Promise<DashboardPointsWeek[]> => {
  const firstTransferDay = await readFirstDriverTransferDay();

  if (firstTransferDay === null) {
    return [];
  }

  const lastWeek = weekStartOf(periodTo);
  const firstJournalWeek = weekStartOf(firstTransferDay);
  const limitWeek = shiftDayKey(lastWeek, -7 * (WEEKS_LIMIT - 1));
  const firstWeek = firstJournalWeek > limitWeek ? firstJournalWeek : limitWeek;

  if (firstWeek > lastWeek) {
    return [];
  }

  const flows = new Map(
    (await sumPointFlowsByWeek(POINT_FLOW_REASONS, firstWeek, lastWeek)).map((week) => [week.weekStart, week]),
  );
  const currentWeek = weekStartOf(formatDayKey(now));
  const weeks: DashboardPointsWeek[] = [];

  for (let weekStart = firstWeek; weekStart <= lastWeek; weekStart = shiftDayKey(weekStart, 7)) {
    const flow = flows.get(weekStart);

    weeks.push({
      weekStart,
      issued: flow?.issued ?? 0,
      spent: flow?.spent ?? 0,
      current: weekStart === currentWeek,
    });
  }

  return weeks;
};
