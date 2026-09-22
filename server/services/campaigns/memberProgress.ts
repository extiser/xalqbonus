import { countedPlainText, plainText } from '#server/bot/texts';
import type { Language } from '#server/generated/prisma/enums';
import type { OpenedChestRow } from '#server/repositories/campaignChests';
import type { MemberCampaignRow } from '#server/repositories/campaigns';
import {
  chestLadder,
  chooseWeekBottomLine,
  chooseWeekTopLine,
  clampedDone,
  DAY_GOAL_TRIPS,
  dayKind,
  figuresFromCounts,
  heatStep,
  isQualifyingDay,
  REQUIRED_DAYS,
  stepDaysLeft,
  THREE_DAYS_REQUIRED,
  weekFigures,
  type ChestStepState,
  type DayChest,
  type WeekBottomLine,
  type WeekFigures,
  type WeekTopLine,
} from '#server/services/campaigns/weekProgress';
import type {
  MemberCampaignProgress,
  MemberCampaignToday,
  MemberChestLadder,
  MemberChestStep,
  MemberDayChest,
  MemberDayChestRow,
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

// ---------------------------------------------------------------------------
// Лестница сундуков (issue #181)
// ---------------------------------------------------------------------------

/** Что выпало из сундука, на языке водителя: баллы — числом, товар и произвольная — названием. */
export const chestPrizeText = (
  chest: Pick<OpenedChestRow, 'rewardKind' | 'rewardPoints' | 'rewardTitle'>,
  language: Language,
): string =>
  chest.rewardKind === 'points' && chest.rewardPoints !== null
    ? countedPlainText('reward_points', language, chest.rewardPoints)
    : chest.rewardTitle;

/** Счёт дня на карточке: «3 из 5». */
const dayTripsText = (trips: number, language: Language): string =>
  plainText('campaign_chest_card_trips', language, {
    trips: String(trips),
    goal: String(DAY_GOAL_TRIPS),
  });

const dayChestLabel = (chest: DayChest, language: Language): string => {
  switch (chest.state) {
    case 'ahead':
      return plainText('campaign_chest_card_ahead', language);
    case 'today':
      return dayTripsText(chest.trips, language);
    case 'missed':
      return plainText('campaign_chest_card_missed', language);
    case 'to_open':
      return plainText('campaign_chest_card_open', language);
    case 'opened':
      return plainText('campaign_chest_opened', language);
  }
};

/**
 * Строка «Сундуки дня» говорит состояние, а не условие, когда сундуки уже есть:
 * «по одному за взятый день» → «К открытию: N» → «открыты» (03-member-chests-states.md).
 */
const describeDayRow = (days: readonly DayChest[], language: Language): MemberDayChestRow => {
  const toOpen = days.filter((chest) => chest.state === 'to_open').length;
  const opened = days.filter((chest) => chest.state === 'opened').length;
  const title = plainText('campaign_chests_day_title', language);

  if (toOpen > 0) {
    return {
      state: 'to_open',
      title,
      caption: plainText('campaign_chests_to_open', language, { count: String(toOpen) }),
      toOpen,
      opened,
    };
  }

  return opened > 0
    ? { state: 'opened', title, caption: plainText('campaign_chests_day_opened', language), toOpen, opened }
    : { state: 'idle', title, caption: plainText('campaign_chests_day_idle', language), toOpen, opened };
};

/** Условие ступени — пока не взят ни один день. */
const stepCondition = (kind: MemberChestStep['kind'], windowDays: number, language: Language): string =>
  kind === 'three_days'
    ? countedPlainText('campaign_chest_three_days_condition', language, THREE_DAYS_REQUIRED)
    : plainText('campaign_chest_week_condition', language, {
        required: String(REQUIRED_DAYS),
        total: String(windowDays),
      });

const stepCaption = (
  kind: MemberChestStep['kind'],
  state: ChestStepState,
  figures: WeekFigures,
  required: number,
  language: Language,
): string => {
  switch (state) {
    case 'opened':
      return plainText('campaign_chest_opened', language);
    case 'to_open':
      return plainText('campaign_chests_to_open', language, { count: '1' });
    case 'unreachable':
      return plainText('campaign_chest_unreachable', language);
    case 'reachable':
      return figures.done === 0
        ? stepCondition(kind, figures.windowDays, language)
        : countedPlainText('campaign_chest_days_left', language, stepDaysLeft(figures, required));
  }
};

const describeStep = (
  kind: MemberChestStep['kind'],
  state: ChestStepState,
  figures: WeekFigures,
  opened: readonly OpenedChestRow[],
  language: Language,
): MemberChestStep => {
  const required = kind === 'three_days' ? THREE_DAYS_REQUIRED : REQUIRED_DAYS;
  const openedChest = opened.find((chest) => chest.kind === kind);

  return {
    kind,
    state,
    required,
    daysLeft: stepDaysLeft(figures, required),
    title: plainText(
      kind === 'three_days' ? 'campaign_chests_three_days_title' : 'campaign_chests_week_title',
      language,
    ),
    caption: stepCaption(kind, state, figures, required, language),
    prizeText: openedChest ? chestPrizeText(openedChest, language) : null,
  };
};

/**
 * Лестница на языке водителя. Числа — из `chestLadder`, та же функция решает, можно ли сундук
 * открыть: экран и открытие не расходятся.
 */
export const describeChestLadder = (
  figures: WeekFigures,
  dayTrips: readonly number[],
  opened: readonly OpenedChestRow[],
  language: Language,
): MemberChestLadder => {
  const ladder = chestLadder(figures, dayTrips, opened);

  const days: MemberDayChest[] = ladder.days.map((chest) => {
    const openedChest = opened.find(
      (candidate) => candidate.kind === 'day' && candidate.dayNumber === chest.day,
    );

    return {
      day: chest.day,
      state: chest.state,
      trips: chest.trips,
      label: dayChestLabel(chest, language),
      // Упущенный показывает счёт сверху, отдельно от ярлыка (04-day-chests-sheet.md).
      tripsText: chest.state === 'missed' ? dayTripsText(chest.trips, language) : null,
      prizeText: openedChest ? chestPrizeText(openedChest, language) : null,
    };
  });

  return {
    dayRow: describeDayRow(ladder.days, language),
    days,
    threeDays: describeStep('three_days', ladder.threeDays, figures, opened, language),
    week: describeStep('week', ladder.week, figures, opened, language),
  };
};

/** Числа замершей недели: все дни прошли, «сегодня» — день после окна (`describeFrozenProgress`). */
export const frozenFigures = (
  row: MemberCampaignRow & { outcome: NonNullable<MemberCampaignRow['outcome']> },
): { figures: WeekFigures; dayTrips: number[] } => {
  const dayTrips = row.outcomeDayTrips ?? [];
  const done = row.qualifiedDays ?? dayTrips.filter(isQualifyingDay).length;

  return {
    figures: figuresFromCounts(row.windowDays, row.windowDays + 1, done, false),
    dayTrips,
  };
};

/**
 * Прогресс идущего окна — от поездок по дням, прочитанных из журнала сейчас. День окна `d`
 * пришёл из базы, посчитанный от «сейчас» резкой суток парка.
 */
export const describeLiveProgress = (
  row: MemberCampaignRow,
  dayTrips: readonly number[],
  opened: readonly OpenedChestRow[],
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
    chests: describeChestLadder(figures, dayTrips, opened, language),
  };
};

/**
 * Замершая неделя — из снимка итога, без журнала. Все дни прошли: считаем её так, будто
 * «сегодня» — день после окна, и в ней не осталось ни дня с сундуком. Строк правой части нет:
 * они про идущее окно («осталось», «в запасе»), а после итога экран показывает итог.
 */
export const describeFrozenProgress = (
  row: MemberCampaignRow & { outcome: NonNullable<MemberCampaignRow['outcome']> },
  opened: readonly OpenedChestRow[],
  language: Language,
): MemberCampaignProgress => {
  const { figures, dayTrips } = frozenFigures(row);
  const { done } = figures;

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
    chests: describeChestLadder(figures, dayTrips, opened, language),
  };
};
