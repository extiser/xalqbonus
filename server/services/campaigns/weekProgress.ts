import type { CampaignParticipantOutcome, CampaignParticipantState } from '#server/generated/prisma/enums';

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

/** Зачётных дней, нужных за окно, — `N` эталона. */
export const REQUIRED_DAYS = 5;

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
