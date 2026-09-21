import { countedPlainText, plainText } from '#server/bot/texts';
import type { Language } from '#server/generated/prisma/enums';
import type { MemberCampaignRow } from '#server/repositories/campaigns';
import {
  chooseWeekBottomLine,
  chooseWeekTopLine,
  clampedDone,
  DAY_GOAL_TRIPS,
  dayKind,
  figuresFromCounts,
  heatStep,
  isQualifyingDay,
  REQUIRED_DAYS,
  weekFigures,
  type WeekBottomLine,
  type WeekFigures,
  type WeekTopLine,
} from '#server/services/campaigns/weekProgress';
import type {
  MemberCampaignProgress,
  MemberCampaignToday,
  MemberWeekDay,
  MemberWeekLine,
} from '#shared/types/miniapp';

/**
 * Прогресс недели на экране участника (issue #168): числа из `weekProgress.ts` и строки
 * на языке водителя. Базы здесь нет — поездки по дням приходят готовыми.
 *
 * Правило чтения одно: исход пуст — считаем от журнала; исход проставлен — рисуем из снимка
 * итога и не считаем ничего. Опоздавшая поездка иначе досчитала бы день до зачётного, и экран
 * показал бы «5 из 5», пока в переписке у водителя висит «не дотянул».
 */

const topLineText = (line: WeekTopLine, language: Language): string => {
  switch (line.kind) {
    case 'chest_days':
      return countedPlainText('campaign_week_chest_days', language, line.count);
    case 'last_day':
      return plainText('campaign_week_last_day', language);
    case 'last_days':
      return countedPlainText('campaign_week_last_days', language, line.count);
    case 'days_left':
      return countedPlainText('campaign_week_days_left', language, line.count);
  }
};

const bottomLineText = (line: WeekBottomLine, language: Language): string => {
  switch (line.kind) {
    case 'prizes':
      return plainText('campaign_week_prizes', language);
    case 'every_goal':
      return plainText('campaign_week_every_goal', language);
    case 'no_skips':
      return plainText('campaign_week_no_skips', language);
    case 'skips_left':
      return countedPlainText('campaign_week_skips_left', language, line.count);
  }
};

/** Верхняя строка на языке водителя. `null` — строки нет. */
export const describeWeekTop = (figures: WeekFigures, language: Language): MemberWeekLine | null => {
  const line = chooseWeekTopLine(figures);

  return line ? { text: topLineText(line, language), tone: line.tone } : null;
};

/** Нижняя строка справа на языке водителя. */
export const describeWeekBottom = (figures: WeekFigures, language: Language): MemberWeekLine => {
  const line = chooseWeekBottomLine(figures);

  return { text: bottomLineText(line, language), tone: line.tone };
};

const describeToday = (trips: number, language: Language): MemberCampaignToday => {
  const tripsLeft = Math.max(DAY_GOAL_TRIPS - trips, 0);
  const goalTaken = tripsLeft === 0;

  const goalText = goalTaken
    ? plainText('campaign_today_goal_taken', language)
    : tripsLeft === 1
      ? plainText('campaign_today_goal_near', language)
      : countedPlainText('campaign_today_goal_waiting', language, tripsLeft);

  return {
    trips,
    tripsLeft,
    goalTaken,
    heatStep: heatStep(trips),
    tripsText: countedPlainText('campaign_today_trips', language, trips),
    goalText,
  };
};

const describeDays = (
  row: MemberCampaignRow,
  dayTrips: readonly number[],
  today: number,
): MemberWeekDay[] =>
  row.dayDates.map((date, index) => {
    const day = index + 1;
    const trips = dayTrips[index] ?? 0;

    return {
      day,
      date,
      trips,
      qualified: isQualifyingDay(trips),
      kind: dayKind(day, today),
    };
  });

const commonTexts = (row: MemberCampaignRow, day: number, done: number, language: Language) => ({
  dayText: plainText('campaign_week_day', language, {
    day: String(day),
    total: String(row.windowDays),
  }),
  counterText: plainText('campaign_week_counter', language, {
    done: String(clampedDone(done)),
    total: String(REQUIRED_DAYS),
  }),
});

/**
 * Прогресс идущего окна — от поездок по дням, прочитанных из журнала сейчас. День окна `d`
 * пришёл из базы, посчитанный от «сейчас» резкой суток парка.
 */
export const describeLiveProgress = (
  row: MemberCampaignRow,
  dayTrips: readonly number[],
  language: Language,
): MemberCampaignProgress => {
  const figures = weekFigures(row.windowDays, row.day, dayTrips);

  return {
    day: row.day,
    windowDays: row.windowDays,
    ...commonTexts(row, row.day, figures.done, language),
    days: describeDays(row, dayTrips, row.day),
    done: clampedDone(figures.done),
    need: figures.need,
    slack: figures.slack,
    chestDays: figures.chestDays,
    today: describeToday(dayTrips[row.day - 1] ?? 0, language),
    weekTop: describeWeekTop(figures, language),
    weekBottom: describeWeekBottom(figures, language),
    frozen: false,
    outcome: null,
  };
};

/**
 * Замершая неделя — из снимка итога, без журнала. Все дни прошли: считаем её так, будто
 * «сегодня» — день после окна, и в ней не осталось ни дня с сундуком. Строк правой части нет:
 * они про идущее окно («осталось», «в запасе»), а после итога экран показывает итог.
 */
export const describeFrozenProgress = (
  row: MemberCampaignRow & { outcome: NonNullable<MemberCampaignRow['outcome']> },
  language: Language,
): MemberCampaignProgress => {
  const dayTrips = row.outcomeDayTrips ?? [];
  const done = row.qualifiedDays ?? dayTrips.filter(isQualifyingDay).length;
  const figures = figuresFromCounts(row.windowDays, row.windowDays + 1, done, false);

  return {
    day: row.windowDays,
    windowDays: row.windowDays,
    ...commonTexts(row, row.windowDays, done, language),
    days: describeDays(row, dayTrips, row.windowDays + 1),
    done: clampedDone(done),
    need: figures.need,
    slack: figures.slack,
    chestDays: figures.chestDays,
    today: null,
    weekTop: null,
    weekBottom: null,
    frozen: true,
    outcome: row.outcome,
  };
};
