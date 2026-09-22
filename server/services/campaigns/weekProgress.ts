import type {
  CampaignChestKind,
  CampaignParticipantOutcome,
  CampaignParticipantState,
} from '#server/generated/prisma/enums';

/**
 * Неделя участника акции — числа и выбор строк блока недели (issue #168).
 *
 * Чистые функции без базы: состояние приходит числами, ответ уходит числами. Эталон —
 * `product/design/comeback/03-member-week-states.md`: формулы производных, таблицы строк верха
 * и низа и приложение с перебором всех троек «день окна, зачтённых дней, взята ли цель сегодня»,
 * по которому функция выбора строк прогоняется целиком (docs/infra.md → «Тесты», четвёртое
 * исключение). Поменялось поведение — первым правится документ, код и тест идут за ним.
 *
 * Своего состояния у прогресса нет: пока окно идёт, он считается от журнала поездок
 * при каждом показе, после итога — рисуется из снимка. Флагом «день зачтён» не хранится:
 * пятая поездка может доехать из Fleet API позже, чем кончился её день.
 */

/** Поездок за сутки, чтобы день зачёлся. */
export const DAY_GOAL_TRIPS = 5;

/** Зачётных дней, нужных за окно, — `N` эталона. Он же порог сундука недели. */
export const REQUIRED_DAYS = 5;

/** Зачётных дней до сундука трёх дней (issue #181). */
export const THREE_DAYS_REQUIRED = 3;

/**
 * Числа недели. `W` — длина окна половины в сутках парка: эталон построен для семи, но окно
 * задаёт сотрудник, и счёт идёт от фактического — строка сроков и клетки обязаны говорить
 * одно. Окно короче пяти дней честно встаёт в «уже не собрать» с первого дня.
 */
export type WeekFigures = {
  /** `W` — дней в окне. */
  windowDays: number;
  /** `d` — номер сегодняшнего дня окна, 1…W. */
  day: number;
  /** Цель сегодняшнего дня взята: `trips[d] >= 5`. */
  goalTakenToday: boolean;
  /** Сколько дней из 1…d зачтено, включая сегодня. Не зажат: верхняя строка смотрит на него. */
  done: number;
  /** `W - d + 1` — дней окна осталось, считая сегодня. */
  leftDays: number;
  /** В скольких днях ещё можно взять сундук дня: сегодняшний, где цель взята, уже закрыт. */
  chestDays: number;
  /** Сколько зачётных дней ещё нужно. Меньше нуля — неделя собрана с запасом. */
  need: number;
  /**
   * Запас пропусков. Считается от `chestDays`, а не от `leftDays`: день, в который цель уже
   * взята, потерять нельзя, и по `leftDays` экран обещал бы выходной, которого нет (случай 9).
   * Меньше нуля — пятёрку уже не собрать.
   */
  slack: number;
};

export const isQualifyingDay = (trips: number): boolean => trips >= DAY_GOAL_TRIPS;

/** Производные эталона ровно по его формулам — от длины окна, дня, зачтённых дней и цели. */
export const figuresFromCounts = (
  windowDays: number,
  day: number,
  done: number,
  goalTakenToday: boolean,
): WeekFigures => {
  const leftDays = windowDays - day + 1;
  const chestDays = leftDays - (goalTakenToday ? 1 : 0);
  const need = REQUIRED_DAYS - done;

  return {
    windowDays,
    day,
    goalTakenToday,
    done,
    leftDays,
    chestDays,
    need,
    slack: chestDays - need,
  };
};

/**
 * Числа недели от поездок по дням окна. `dayTrips` — по одному числу на день окна, в порядке
 * дней; будущие дни — нули. Считаются только дни 1…d: будущих поездок не бывает, а лишнее
 * число в хвосте не должно тихо стать зачтённым днём.
 */
export const weekFigures = (windowDays: number, day: number, dayTrips: readonly number[]): WeekFigures => {
  const elapsed = dayTrips.slice(0, day);

  return figuresFromCounts(
    windowDays,
    day,
    elapsed.filter(isQualifyingDay).length,
    isQualifyingDay(dayTrips[day - 1] ?? 0),
  );
};

/** Счётчик под неделей: зажат на `N`, иначе водитель, берущий цель каждый день, увидел бы «6 из 5». */
export const clampedDone = (done: number): number => Math.min(done, REQUIRED_DAYS);

/** Вид строки: золото, серый или белый — как в таблицах эталона. */
export type WeekLineTone = 'gold' | 'grey' | 'white';

/** Верхняя строка справа — что она говорит, без языка. */
export type WeekTopLine =
  /** «ещё N дня с сундуками» */
  | { kind: 'chest_days'; count: number; tone: WeekLineTone }
  /** «последний день» */
  | { kind: 'last_day'; tone: WeekLineTone }
  /** «последние N дня» */
  | { kind: 'last_days'; count: number; tone: WeekLineTone }
  /** «осталось N дней» */
  | { kind: 'days_left'; count: number; tone: WeekLineTone };

/** Нижняя строка справа. Слева всегда `clampedDone` из пяти. */
export type WeekBottomLine =
  /** «призы в конце недели» */
  | { kind: 'prizes'; tone: WeekLineTone }
  /** «каждые 5 поездок — сундук» */
  | { kind: 'every_goal'; tone: WeekLineTone }
  /** «пропусков не осталось» */
  | { kind: 'no_skips'; tone: WeekLineTone }
  /** «ещё N пропуск в запасе» */
  | { kind: 'skips_left'; count: number; tone: WeekLineTone };

/**
 * Верхняя строка: ветки сверху вниз, первая подошедшая выигрывает. Строка ведёт обратный
 * отсчёт, пока судьба большого сундука не решена; решена — переключается на то, что ещё
 * капает. Взял — золото, не успел — серый: золото поверх потерянного сундука выглядит издёвкой.
 * `null` — строки нет.
 */
export const chooseWeekTopLine = (figures: WeekFigures): WeekTopLine | null => {
  const { done, chestDays, slack, leftDays } = figures;

  if (done >= REQUIRED_DAYS) {
    return chestDays > 0 ? { kind: 'chest_days', count: chestDays, tone: 'gold' } : null;
  }

  if (slack < 0) {
    return chestDays > 0 ? { kind: 'chest_days', count: chestDays, tone: 'grey' } : null;
  }

  if (slack === 0) {
    return leftDays === 1
      ? { kind: 'last_day', tone: 'gold' }
      : { kind: 'last_days', count: leftDays, tone: 'gold' };
  }

  return { kind: 'days_left', count: leftDays, tone: 'grey' };
};

/** Нижняя строка справа. Говорит фактом и не зовёт в машину, приговоров в ней нет. */
export const chooseWeekBottomLine = (figures: WeekFigures): WeekBottomLine => {
  const { done, slack } = figures;

  if (done >= REQUIRED_DAYS) {
    return { kind: 'prizes', tone: 'grey' };
  }

  if (slack < 0) {
    return { kind: 'every_goal', tone: 'grey' };
  }

  if (slack === 0) {
    return { kind: 'no_skips', tone: 'white' };
  }

  return { kind: 'skips_left', count: slack, tone: 'grey' };
};

/** Вид клетки дня относительно сегодняшнего. */
export type WeekDayKind = 'past' | 'today' | 'future';

export const dayKind = (dayNumber: number, today: number): WeekDayKind => {
  if (dayNumber < today) {
    return 'past';
  }

  return dayNumber === today ? 'today' : 'future';
};

// ---------------------------------------------------------------------------
// Лестница сундуков (issue #181)
// ---------------------------------------------------------------------------
//
// Лестница — не второй счёт зачётных дней, а продолжение чисел недели: всё берётся из `done`
// и `chestDays`. Сундук открывается сразу, как заработан, — правило одно на все три ступени
// (docs/decisions.md → «Сундук открывается сразу, как заработан»).

/**
 * Ступень на `required` дней уже не собрать: дней, в которых ещё можно взять цель, меньше,
 * чем нужно добрать. `chestDays` сегодняшний день со взятой целью уже не считает — он зачтён
 * и сидит в `done`. Для пятёрки это тот же расчёт, что `slack < 0`.
 */
export const isStepUnreachable = (figures: WeekFigures, required: number): boolean =>
  figures.chestDays < required - figures.done;

/** Состояние ступени трёх дней или недели. */
export type ChestStepState =
  /** Ещё не заработана и достижима. */
  | 'reachable'
  /** Заработана и ждёт открытия. */
  | 'to_open'
  | 'opened'
  /** Уже не собрать. Со строки не убирается: пропавшая награда выглядит как обман. */
  | 'unreachable';

/**
 * Открытая ступень остаётся открытой, что бы ни случилось с числами; заработанная — не гаснет:
 * взятый день необратим, и проверка заработка идёт раньше проверки недостижимости.
 */
export const chestStepState = (
  figures: WeekFigures,
  required: number,
  opened: boolean,
): ChestStepState => {
  if (opened) {
    return 'opened';
  }

  if (figures.done >= required) {
    return 'to_open';
  }

  return isStepUnreachable(figures, required) ? 'unreachable' : 'reachable';
};

/** Сколько зачётных дней ещё нужно до ступени. Ноль — ступень заработана. */
export const stepDaysLeft = (figures: WeekFigures, required: number): number =>
  Math.max(required - figures.done, 0);

/** Состояние карточки сундука дня — пять, по `04-day-chests-sheet.md`. */
export type DayChestState =
  /** День ещё не наступил. */
  | 'ahead'
  /** День идёт, цель не взята. */
  | 'today'
  /** День зачтён, сундук ждёт. Сегодняшний со взятой целью — тоже здесь, а не «сегодня». */
  | 'to_open'
  | 'opened'
  /** День прошёл без цели. */
  | 'missed';

/**
 * Карточка дня: сначала открытость, потом зачёт, потом место дня относительно сегодняшнего.
 * «К открытию» сильнее «сегодня»: пятая поездка закрывает сегодняшний день посреди смены.
 */
export const dayChestState = (
  dayNumber: number,
  today: number,
  trips: number,
  opened: boolean,
): DayChestState => {
  if (opened) {
    return 'opened';
  }

  if (dayNumber > today) {
    return 'ahead';
  }

  if (isQualifyingDay(trips)) {
    return 'to_open';
  }

  return dayNumber === today ? 'today' : 'missed';
};

/** Открытый сундук — из строки `campaign_chests`: ступень и день окна у сундука дня. */
export type OpenedChestRef = {
  kind: CampaignChestKind;
  dayNumber: number | null;
};

export type DayChest = {
  day: number;
  trips: number;
  state: DayChestState;
};

/** Лестница целиком: карточка на каждый день окна и две ступени. */
export type ChestLadder = {
  days: DayChest[];
  threeDays: ChestStepState;
  week: ChestStepState;
};

/**
 * Лестница от чисел недели, поездок по дням и открытых сундуков. Сегодняшний день — `figures.day`:
 * у замершей недели это день после окна, и все карточки оказываются в прошлом.
 */
export const chestLadder = (
  figures: WeekFigures,
  dayTrips: readonly number[],
  opened: readonly OpenedChestRef[],
): ChestLadder => {
  const openedDays = new Set(
    opened.filter((chest) => chest.kind === 'day').map((chest) => chest.dayNumber),
  );
  const isOpened = (kind: CampaignChestKind): boolean => opened.some((chest) => chest.kind === kind);

  return {
    days: Array.from({ length: figures.windowDays }, (_unused, index) => {
      const day = index + 1;
      const trips = dayTrips[index] ?? 0;

      return { day, trips, state: dayChestState(day, figures.day, trips, openedDays.has(day)) };
    }),
    threeDays: chestStepState(figures, THREE_DAYS_REQUIRED, isOpened('three_days')),
    week: chestStepState(figures, REQUIRED_DAYS, isOpened('week')),
  };
};

/**
 * Ступень нагрева блока дневной цели: 0–1 поездка — холодно, 2–3 — гранат, 4 и больше — огонь.
 * Три ступени, а не шесть: при шаге в одну поездку экран дёргался бы пять раз за смену
 * (`03-member-heat-scale.md`).
 */
export type HeatStep = 1 | 2 | 3;

export const heatStep = (tripsToday: number): HeatStep => {
  if (tripsToday >= 4) {
    return 3;
  }

  return tripsToday >= 2 ? 2 : 1;
};

/**
 * Исход окна — по состоянию участия и числам, в этом порядке. Поездки здесь — только
 * зачитанные, то есть завершённые после вступления: у не вступившего их нет по построению.
 */
export const decideOutcome = (
  state: CampaignParticipantState,
  dayTrips: readonly number[],
): CampaignParticipantOutcome => {
  switch (state) {
    case 'invited':
      return 'no_response';
    case 'opened':
    case 'declined':
      return 'seen_not_joined';
    case 'joined': {
      if (dayTrips.filter(isQualifyingDay).length >= REQUIRED_DAYS) {
        return 'returned';
      }

      return dayTrips.some((trips) => trips > 0) ? 'short' : 'joined_no_trips';
    }
  }
};
