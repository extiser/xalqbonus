import {
  listLeaderPeople,
  listPersonTrips,
  listPersonWeekTrips,
  type LeaderPersonRow,
  type PersonTripsRow,
  type PersonWeekTripsRow,
} from '#server/repositories/metrics';
import {
  BELOW_NORM_SHARE,
  LEADERS_SHARE,
  METRICS_FIRST_DAY,
  NORM_MIN_WEEKS_WITH_TRIPS,
  NORM_WEEKS,
  STREAK_MIN_WEEKS,
} from '#server/services/metrics/constants';
import { wholeMonthPeriod } from '#server/services/metrics/monthPeriod';
import { coverageByMonth, isComplete } from '#server/services/metrics/periodCoverage';
import { formatDayKey, shiftDayKey } from '#server/utils/parkTime';
import { shiftMonth } from '#shared/monthNames';
import type {
  DashboardLeaderGroup,
  DashboardLeaderRow,
  DashboardLeaders,
  DashboardLeadersThresholds,
  DashboardPeriod,
} from '#shared/types/dashboard';

/**
 * Лидеры по поездкам и список тех, кого парк может потерять (issue #402) — при открытии экрана
 * из готовой таблицы `metric_person_days` (docs/decisions.md → «Лидеры по поездкам и список
 * тех, кого парк может потерять»).
 *
 * Выбран месяц M. Лидеры — водители на линии за L = M−1, верхние `LEADERS_SHARE` по поездкам.
 * Их состояние — на опорный день D: у закрытого M его последний день, у идущего — вчера;
 * последняя полная неделя W — пн–вс, кончающаяся не позже D.
 *
 * Норма водителя на неделю — медиана поездок по неделям с поездками среди `NORM_WEEKS` недель
 * перед ней, если таких недель не меньше `NORM_MIN_WEEKS_WITH_TRIPS`. Неделя ниже нормы — поездок
 * меньше нормы × (1 − `BELOW_NORM_SHARE`), пустая тоже; неделя без нормы серию прерывает. Серия —
 * подряд недели ниже нормы, кончающиеся на W; недели считаются с той, в которую входит первый
 * день L. Серия с нулём в W — «перестали», но не тот, кто ездил после W, до D: он вернулся.
 *
 * «Ушли» — когорта C: лидеры месяца когорты без единой поездки в следующем за ним. У закрытого M
 * месяц когорты — L, у идущего — M−2: идущий месяц показывает последний закрытый, как поток.
 * Строка ушедшего — факт на D: настоящая последняя поездка, поездки за W; норма — до остановки,
 * по последней поездке перед пустым месяцем
 * (docs/decisions.md → «Лидеры по поездкам и список тех, кого парк может потерять»).
 *
 * Собраны не все нужные сутки — элемент не считается: пропуск выглядит как неделя без поездок
 * и делает водителя «переставшим» с именем и телефоном. У «ездят меньше» — от окна нормы самой
 * ранней недели до конца W, у «ушли» — от окна нормы перед месяцем когорты до конца следующего
 * за ним. Сутки раньше `METRICS_FIRST_DAY` — не пропуск, а отсутствие истории, и не проверяются.
 */

const FIRST_MONTH = METRICS_FIRST_DAY.slice(0, 7);

const WEEK_DAYS = 7;

/** Порог и доля целыми процентами: сравнение и ранжирование — без дробей с плавающей точкой. */
const LEADERS_PERCENT = Math.round(LEADERS_SHARE * 100);
const BELOW_NORM_PERCENT = Math.round(BELOW_NORM_SHARE * 100);

export const LEADERS_THRESHOLDS: DashboardLeadersThresholds = {
  leadersPercent: LEADERS_PERCENT,
  normWeeks: NORM_WEEKS,
  belowNormPercent: BELOW_NORM_PERCENT,
  streakMinWeeks: STREAK_MIN_WEEKS,
};

/** ФИО и телефоны строки — для выгрузки; на экран не уходят. */
export type LeaderContact = Pick<LeaderPersonRow, 'lastName' | 'firstName' | 'middleName' | 'phones'>;

export type LeadersReport = {
  dashboard: DashboardLeaders;
  /** По `personId` строки списка. */
  contacts: Map<string, LeaderContact>;
};

/** День недели: 0 — понедельник, 6 — воскресенье. Календарный, зона не участвует. */
const weekdayOf = (day: string): number => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % WEEK_DAYS;

const mondayOf = (day: string): string => shiftDayKey(day, -weekdayOf(day));

/** Целых суток от `from` до `to`. */
const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

/** Лидеры месяца: по поездкам по убыванию, затем по `person_id`; первые ⌈на линии × доля⌉. */
const pickLeaders = (people: readonly PersonTripsRow[]): PersonTripsRow[] => {
  const ranked = [...people].sort(
    (first, second) => second.trips - first.trips || (first.personId < second.personId ? -1 : 1),
  );

  return ranked.slice(0, Math.ceil((people.length * LEADERS_PERCENT) / 100));
};

const sumTrips = (people: readonly PersonTripsRow[]): number =>
  people.reduce((total, person) => total + person.trips, 0);

/** Недели одного человека: поездки и последние сутки с поездкой по понедельнику недели. */
type PersonWeeks = Map<string, { trips: number; lastDay: string }>;

const groupWeeks = (rows: readonly PersonWeekTripsRow[]): Map<string, PersonWeeks> => {
  const byPerson = new Map<string, PersonWeeks>();

  for (const row of rows) {
    const weeks = byPerson.get(row.personId) ?? new Map();

    weeks.set(row.weekStart, { trips: row.trips, lastDay: row.lastDay });
    byPerson.set(row.personId, weeks);
  }

  return byPerson;
};

const tripsIn = (weeks: PersonWeeks | undefined, weekStart: string): number => weeks?.get(weekStart)?.trips ?? 0;

/** Норма на неделю `weekStart`; `null` — нормы нет. */
const normAt = (weeks: PersonWeeks | undefined, weekStart: string): number | null => {
  const withTrips: number[] = [];

  for (let back = 1; back <= NORM_WEEKS; back += 1) {
    const trips = tripsIn(weeks, shiftDayKey(weekStart, -back * WEEK_DAYS));

    if (trips > 0) withTrips.push(trips);
  }

  return withTrips.length < NORM_MIN_WEEKS_WITH_TRIPS ? null : median(withTrips);
};

/** Неделя ниже нормы: норма есть и поездок меньше нормы × (1 − доля). Целыми процентами. */
const isBelow = (trips: number, norm: number | null): boolean =>
  norm !== null && trips * 100 < norm * (100 - BELOW_NORM_PERCENT);

/** Серия недель ниже нормы, кончающаяся на `lastWeek`, не раньше `firstWeek`. */
const streakOf = (weeks: PersonWeeks | undefined, firstWeek: string, lastWeek: string): number => {
  let streak = 0;

  for (let week = lastWeek; week >= firstWeek; week = shiftDayKey(week, -WEEK_DAYS)) {
    if (!isBelow(tripsIn(weeks, week), normAt(weeks, week))) break;
    streak += 1;
  }

  return streak;
};

/** Последние сутки с поездкой не позже `day`. */
const lastTripUpTo = (weeks: PersonWeeks | undefined, day: string): string | null => {
  let last: string | null = null;

  for (const week of weeks?.values() ?? []) {
    if (week.lastDay <= day && (last === null || week.lastDay > last)) last = week.lastDay;
  }

  return last;
};

type DraftRow = Omit<DashboardLeaderRow, 'callsign' | 'name' | 'inProgram'> & {
  /** Порядок внутри группы: отклонение у «ездят меньше». */
  ratio: number;
};

/** «Фамилия Имя Отчество» как в базе; пусто — `null`. Им же подписан список новичков (issue #407). */
export const fullName = (person: LeaderPersonRow | undefined): string | null => {
  const name = [person?.lastName, person?.firstName, person?.middleName]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part !== '')
    .join(' ');

  return name === '' ? null : name;
};

const GROUP_ORDER: readonly DashboardLeaderGroup[] = ['below', 'stopped', 'left'];

/** Порядок экрана: группы по очереди; «ездят меньше» — сильнее вниз сверху, остальные — недавние сверху. */
const compareRows = (first: DraftRow, second: DraftRow): number => {
  const byGroup = GROUP_ORDER.indexOf(first.group) - GROUP_ORDER.indexOf(second.group);

  if (byGroup !== 0) return byGroup;

  const byValue =
    first.group === 'below'
      ? first.ratio - second.ratio
      : second.lastTripDay.localeCompare(first.lastTripDay);

  return byValue || (first.personId < second.personId ? -1 : 1);
};

export const readLeaders = async (month: string, now: Date = new Date()): Promise<LeadersReport> => {
  const yesterday = shiftDayKey(formatDayKey(now), -1);
  const ongoing = month >= formatDayKey(now).slice(0, 7);
  const leadersMonth = shiftMonth(month, -1);
  const cohortMonth = ongoing ? shiftMonth(month, -2) : leadersMonth;
  const emptyMonth = shiftMonth(cohortMonth, 1);
  const asOfDay = ongoing ? yesterday : wholeMonthPeriod(month).to;
  const weekTo = shiftDayKey(asOfDay, -((weekdayOf(asOfDay) + 1) % WEEK_DAYS));
  const lastWeek = shiftDayKey(weekTo, -(WEEK_DAYS - 1));

  const base = {
    thresholds: LEADERS_THRESHOLDS,
    leadersMonth,
    cohortMonth,
    ongoing,
    asOfDay,
    week: { from: lastWeek, to: weekTo },
  };

  if (leadersMonth < FIRST_MONTH) {
    return {
      dashboard: { ...base, noLeaders: true, leaders: null, slipping: null, left: null, list: null },
      contacts: new Map(),
    };
  }

  const leadersPeriod = wholeMonthPeriod(leadersMonth);
  const firstWeek = mondayOf(leadersPeriod.from);
  const normFrom = shiftDayKey(firstWeek, -NORM_WEEKS * WEEK_DAYS);
  const cohortAvailable = cohortMonth >= FIRST_MONTH;
  // Окно нормы самой ранней недели — до конца W, месяц лидеров — целиком. У закрытого M — до его
  // конца: «ездят меньше» и «перестали» — лидеры не из когорты, а она смотрит весь M.
  const weeksTo = weekTo > leadersPeriod.to ? weekTo : leadersPeriod.to;
  const slippingTo = ongoing ? weeksTo : asOfDay;

  const [leadersCoverage, slippingCoverage, leftCoverage] = await Promise.all([
    coverageByMonth(leadersPeriod.from, leadersPeriod.to),
    coverageByMonth(normFrom, slippingTo),
    // Месяц когорты и следующий, а перед ними — окно нормы до остановки: её недели уходят
    // раньше месяца когорты.
    cohortAvailable
      ? coverageByMonth(
          shiftDayKey(mondayOf(wholeMonthPeriod(cohortMonth).from), -NORM_WEEKS * WEEK_DAYS),
          wholeMonthPeriod(emptyMonth).to,
        )
      : Promise.resolve([]),
  ]);

  const leadersCounted = isComplete(leadersCoverage);
  const slippingCounted = leadersCounted && isComplete(slippingCoverage);
  const leftCounted = cohortAvailable && isComplete(leftCoverage);
  const listCounted = slippingCounted && (leftCounted || !cohortAvailable);

  // Лидеры месяца лидеров нужны всем частям; когорта — плитке и группе «ушли».
  const [leadersMonthPeople, cohortMonthPeople, emptyMonthPeople] = await Promise.all([
    leadersCounted ? listPersonTrips(leadersPeriod.from, leadersPeriod.to) : Promise.resolve([]),
    leftCounted && cohortMonth !== leadersMonth
      ? listPersonTrips(wholeMonthPeriod(cohortMonth).from, wholeMonthPeriod(cohortMonth).to)
      : Promise.resolve(null),
    leftCounted && emptyMonth !== leadersMonth
      ? listPersonTrips(wholeMonthPeriod(emptyMonth).from, wholeMonthPeriod(emptyMonth).to)
      : Promise.resolve(null),
  ]);

  const leaders = pickLeaders(leadersMonthPeople);
  const cohortLeaders = pickLeaders(cohortMonthPeople ?? leadersMonthPeople);
  const ridingInEmptyMonth = new Set((emptyMonthPeople ?? leadersMonthPeople).map((person) => person.personId));
  const cohort = leftCounted ? cohortLeaders.filter((person) => !ridingInEmptyMonth.has(person.personId)) : [];
  const cohortIds = new Set(cohort.map((person) => person.personId));

  const notCounted = (coverage: DashboardPeriod[]) => ({ counted: false as const, coverage });

  const leadersPart = leadersCounted
    ? {
        counted: true as const,
        leaders: leaders.length,
        driversOnLine: leadersMonthPeople.length,
        leaderTrips: sumTrips(leaders),
        allTrips: sumTrips(leadersMonthPeople),
      }
    : notCounted(leadersCoverage);

  const leftPart = !cohortAvailable
    ? null
    : leftCounted
      ? { counted: true as const, left: cohort.length, leaders: cohortLeaders.length, trips: sumTrips(cohort) }
      : notCounted(leftCoverage);

  if (!slippingCounted) {
    // Без недель окна нормы и серии нет ни группы «ездят меньше», ни списка.
    return {
      dashboard: {
        ...base,
        noLeaders: false,
        leaders: leadersPart,
        slipping: notCounted(slippingCoverage),
        left: leftPart,
        list: notCounted([...slippingCoverage, ...leftCoverage]),
      },
      contacts: new Map(),
    };
  }

  const tracked = [...new Set([...leaders, ...cohort].map((person) => person.personId))];
  const weeksFrom = shiftDayKey(
    mondayOf(wholeMonthPeriod(cohortMonth < leadersMonth ? cohortMonth : leadersMonth).from),
    -NORM_WEEKS * WEEK_DAYS,
  );
  const weeksByPerson = groupWeeks(tracked.length > 0 ? await listPersonWeekTrips(tracked, weeksFrom, asOfDay) : []);

  const drafts: DraftRow[] = [];

  for (const leader of leaders) {
    if (cohortIds.has(leader.personId)) continue;

    const weeks = weeksByPerson.get(leader.personId);
    const streak = streakOf(weeks, firstWeek, lastWeek);
    const lastTripDay = lastTripUpTo(weeks, asOfDay);

    if (streak < STREAK_MIN_WEEKS || lastTripDay === null) continue;

    const weekTrips = tripsIn(weeks, lastWeek);

    // Ноль в W, но ездил после неё — вернулся, звонить незачем.
    if (weekTrips === 0 && lastTripDay > weekTo) continue;

    // Серия кончается на W — норма на W есть.
    const norm = normAt(weeks, lastWeek) ?? 0;
    const ratio = weekTrips / norm;

    drafts.push({
      personId: leader.personId,
      group: weekTrips > 0 ? 'below' : 'stopped',
      weekTrips,
      norm: Math.round(norm),
      deviationPercent: weekTrips > 0 ? Math.round((ratio - 1) * 100) : null,
      idleDays: weekTrips > 0 ? null : daysBetween(lastTripDay, asOfDay),
      weeksBelow: streak,
      lastTripDay,
      ratio,
    });
  }

  const emptyMonthStart = wholeMonthPeriod(emptyMonth).from;

  for (const person of listCounted ? cohort : []) {
    const weeks = weeksByPerson.get(person.personId);
    const lastTripDay = lastTripUpTo(weeks, asOfDay);
    // Остановка — последняя поездка перед пустым месяцем: у лидера когорты она в его месяце.
    const stopDay = lastTripUpTo(weeks, shiftDayKey(emptyMonthStart, -1));

    if (lastTripDay === null || stopDay === null) continue;

    const norm = normAt(weeks, mondayOf(stopDay));

    drafts.push({
      personId: person.personId,
      group: 'left',
      weekTrips: tripsIn(weeks, lastWeek),
      norm: norm === null ? null : Math.round(norm),
      deviationPercent: null,
      idleDays: daysBetween(lastTripDay, asOfDay),
      weeksBelow: null,
      lastTripDay,
      ratio: 0,
    });
  }

  drafts.sort(compareRows);

  const people = new Map(
    (await listLeaderPeople(drafts.map((draft) => ({ personId: draft.personId, lastDay: draft.lastTripDay })))).map(
      (person) => [person.personId, person],
    ),
  );

  const rows = drafts.map(({ ratio: _ratio, ...draft }): DashboardLeaderRow => {
    const person = people.get(draft.personId);

    return { ...draft, callsign: person?.callsign ?? null, name: fullName(person), inProgram: person?.inProgram ?? false };
  });

  const contacts = new Map(
    [...people.values()].map((person) => [
      person.personId,
      { lastName: person.lastName, firstName: person.firstName, middleName: person.middleName, phones: person.phones },
    ]),
  );

  return {
    dashboard: {
      ...base,
      noLeaders: false,
      leaders: leadersPart,
      slipping: {
        counted: true,
        below: rows.filter((row) => row.group === 'below').length,
        stopped: rows.filter((row) => row.group === 'stopped').length,
      },
      left: leftPart,
      list: listCounted ? { counted: true, rows } : notCounted([...leftCoverage]),
    },
    contacts,
  };
};
