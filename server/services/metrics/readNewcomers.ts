import {
  listLeaderPeople,
  listNewcomerCohortMonths,
  listNewcomerWindows,
  type NewcomerCohortMonthRow,
  type NewcomerWindowRow,
} from '#server/repositories/metrics';
import {
  METRICS_FIRST_DAY,
  NEWCOMER_CURVE_POINTS,
  NEWCOMER_CURVE_WINDOW_MONTHS,
  NEWCOMER_FIRST_DAYS,
  NEWCOMER_TRIPS_TARGET,
} from '#server/services/metrics/constants';
import { wholeMonthPeriod } from '#server/services/metrics/monthPeriod';
import { coverageByMonth, isComplete } from '#server/services/metrics/periodCoverage';
import { fullName, type LeaderContact } from '#server/services/metrics/readLeaders';
import { formatDayKey, shiftDayKey } from '#server/utils/parkTime';
import { shiftMonth } from '#shared/monthNames';
import type {
  DashboardNewcomerRow,
  DashboardNewcomers,
  DashboardNewcomersCurvePoint,
  DashboardNewcomersFirstDays,
  DashboardNewcomersRetention,
  DashboardNewcomersThresholds,
  DashboardPeriod,
} from '#shared/types/dashboard';

/**
 * Новички на «Глубине» (issue #407) — при открытии экрана из готовой таблицы `metric_person_days`
 * (docs/decisions.md → «Новички на дашборде»).
 *
 * Новичок месяца X — человек, чьи самые ранние сутки в таблице приходятся на X и кто не ездил до
 * истории заказов — по комиссиям парка (`metric_person_prior`). Наборы — с месяца после первого
 * месяца истории: в октябре 2025 история начинается, и «впервые» там все.
 *
 * Выбран месяц M, опорный день D — как у «Глубины»: у закрытого M его последний день, у идущего —
 * вчера. Месяц кривой R — у закрытого M он сам, у идущего M − 1: идущий месяц показывает последний
 * закрытый, как поток и лидеры.
 *
 * «Сколько остаётся» — по R. Главная цифра — доля новичков R − 1, ездивших в R. Точка «+k» —
 * по наборам C от R − `NEWCOMER_CURVE_WINDOW_MONTHS` до R − 1, не раньше первого, у которых C + k
 * не позже R: сумма ездивших в C + k ÷ сумма размеров наборов — взвешенно, а не средним процентов.
 *
 * «Первые 14 дней» — по M на D. Окно новичка — день первой поездки и `NEWCOMER_FIRST_DAYS − 1`
 * следующих; прошло, если его последний день не позже D. Сравнение — новички M − 1 тем же
 * расчётом на тот же D. Список — новички M с прошедшим окном и поездками меньше порога.
 *
 * Новичку нужна вся история: первая поездка смотрит все сутки с `METRICS_FIRST_DAY`. Собраны
 * не все — элемент не считается: у «Сколько остаётся» сутки по конец R, у «Первых 14 дней»
 * и списка — по D. Пропуск сдвинул бы первую поездку и сделал бы ездившего «пропавшим».
 */

const FIRST_MONTH = METRICS_FIRST_DAY.slice(0, 7);

/** Первый набор: месяц после первого месяца истории. */
const FIRST_COHORT_MONTH = shiftMonth(FIRST_MONTH, 1);

export const NEWCOMERS_THRESHOLDS: DashboardNewcomersThresholds = {
  firstDays: NEWCOMER_FIRST_DAYS,
  tripsTarget: NEWCOMER_TRIPS_TARGET,
};

export type NewcomersReport = {
  dashboard: DashboardNewcomers;
  /** По `personId` строки списка: ФИО и телефоны для выгрузки, на экран не уходят. */
  contacts: Map<string, LeaderContact>;
};

/** Последний день окна первых дней новичка. */
const windowEndOf = (firstDay: string): string => shiftDayKey(firstDay, NEWCOMER_FIRST_DAYS - 1);

const notCounted = (coverage: DashboardPeriod[]) => ({ counted: false as const, coverage });

/** Наборы окна кривой: ездившие по месяцу набора и месяцу езды. */
const groupCohorts = (rows: readonly NewcomerCohortMonthRow[]): Map<string, Map<string, number>> => {
  const byCohort = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const months = byCohort.get(row.cohortMonth) ?? new Map<string, number>();

    months.set(row.month, row.drivers);
    byCohort.set(row.cohortMonth, months);
  }

  return byCohort;
};

const retentionOf = (rows: readonly NewcomerCohortMonthRow[], curveMonth: string, curveFromMonth: string) => {
  const cohorts = groupCohorts(rows);
  const ridingIn = (cohortMonth: string, month: string): number => cohorts.get(cohortMonth)?.get(month) ?? 0;
  const lastCohort = shiftMonth(curveMonth, -1);
  const curve: DashboardNewcomersCurvePoint[] = [];

  for (let offset = 1; offset <= NEWCOMER_CURVE_POINTS; offset += 1) {
    let riding = 0;
    let newcomers = 0;

    // Наборы, у которых месяц «набор + offset» не позже R.
    for (let cohort = curveFromMonth; cohort <= shiftMonth(curveMonth, -offset); cohort = shiftMonth(cohort, 1)) {
      riding += ridingIn(cohort, shiftMonth(cohort, offset));
      newcomers += ridingIn(cohort, cohort);
    }

    // Точка без единого новичка за ней не рисуется; дальше их ещё меньше.
    if (newcomers === 0) break;

    curve.push({ offset, riding, newcomers });
  }

  const retention: DashboardNewcomersRetention = {
    newcomers: ridingIn(lastCohort, lastCohort),
    riding: ridingIn(lastCohort, curveMonth),
    curve,
    curveFromMonth,
  };

  return retention;
};

const firstDaysOf = (
  rows: readonly NewcomerWindowRow[],
  previousRows: readonly NewcomerWindowRow[] | null,
  asOfDay: string,
): DashboardNewcomersFirstDays => {
  const passedOf = (people: readonly NewcomerWindowRow[]) =>
    people.filter((person) => windowEndOf(person.firstDay) <= asOfDay);
  const reachedOf = (people: readonly NewcomerWindowRow[]) =>
    people.filter((person) => person.windowTrips >= NEWCOMER_TRIPS_TARGET).length;

  const passed = passedOf(rows);
  const reached = reachedOf(passed);
  const earliest = rows.map((person) => person.firstDay).sort()[0];
  const previousPassed = previousRows === null ? null : passedOf(previousRows);

  return {
    newcomers: rows.length,
    reached,
    below: passed.length - reached,
    running: rows.length - passed.length,
    firstResultsDay: passed.length === 0 && earliest !== undefined ? windowEndOf(earliest) : null,
    previous: previousPassed === null ? null : { passed: previousPassed.length, reached: reachedOf(previousPassed) },
  };
};

/** Порядок списка: поездки за окно по возрастанию, затем первая поездка, затем `person_id`. */
const compareRows = (first: NewcomerWindowRow, second: NewcomerWindowRow): number =>
  first.windowTrips - second.windowTrips ||
  first.firstDay.localeCompare(second.firstDay) ||
  (first.personId < second.personId ? -1 : 1);

export const readNewcomers = async (month: string, now: Date = new Date()): Promise<NewcomersReport> => {
  const yesterday = shiftDayKey(formatDayKey(now), -1);
  const ongoing = month >= formatDayKey(now).slice(0, 7);
  const asOfDay = ongoing ? yesterday : wholeMonthPeriod(month).to;
  const curveMonth = ongoing ? shiftMonth(month, -1) : month;

  const base = {
    thresholds: NEWCOMERS_THRESHOLDS,
    ongoing,
    asOfDay,
    curveMonth,
    firstCohortMonth: FIRST_COHORT_MONTH,
  };

  if (month < FIRST_COHORT_MONTH) {
    return {
      dashboard: { ...base, noNewcomers: true, retention: null, firstDays: null, list: null },
      contacts: new Map(),
    };
  }

  // Всё нужное — сутки с начала истории по D; кривой из них — месяцы по R.
  const coverage = await coverageByMonth(METRICS_FIRST_DAY, asOfDay);
  const curveCoverage = coverage.filter((period) => period.from.slice(0, 7) <= curveMonth);

  const retentionAvailable = shiftMonth(curveMonth, -1) >= FIRST_COHORT_MONTH;
  const retentionCounted = retentionAvailable && isComplete(curveCoverage);
  const firstDaysCounted = isComplete(coverage);

  const windowFrom = shiftMonth(curveMonth, -NEWCOMER_CURVE_WINDOW_MONTHS);
  const curveFromMonth = windowFrom < FIRST_COHORT_MONTH ? FIRST_COHORT_MONTH : windowFrom;
  const previousMonth = shiftMonth(month, -1);

  const [cohortRows, windowRows, previousRows] = await Promise.all([
    retentionCounted
      ? listNewcomerCohortMonths(curveFromMonth, shiftMonth(curveMonth, -1), wholeMonthPeriod(curveMonth).to)
      : Promise.resolve([]),
    firstDaysCounted ? listNewcomerWindows(month, asOfDay, NEWCOMER_FIRST_DAYS) : Promise.resolve([]),
    firstDaysCounted && previousMonth >= FIRST_COHORT_MONTH
      ? listNewcomerWindows(previousMonth, asOfDay, NEWCOMER_FIRST_DAYS)
      : Promise.resolve(null),
  ]);

  const retention = !retentionAvailable
    ? null
    : retentionCounted
      ? { counted: true as const, ...retentionOf(cohortRows, curveMonth, curveFromMonth) }
      : notCounted(curveCoverage);

  if (!firstDaysCounted) {
    return {
      dashboard: {
        ...base,
        noNewcomers: false,
        retention,
        firstDays: notCounted(coverage),
        list: notCounted(coverage),
      },
      contacts: new Map(),
    };
  }

  const drafts = windowRows
    .filter((person) => windowEndOf(person.firstDay) <= asOfDay && person.windowTrips < NEWCOMER_TRIPS_TARGET)
    .sort(compareRows);

  const people = new Map(
    (await listLeaderPeople(drafts.map((draft) => ({ personId: draft.personId, lastDay: draft.lastDay })))).map(
      (person) => [person.personId, person],
    ),
  );

  const rows = drafts.map((draft): DashboardNewcomerRow => {
    const person = people.get(draft.personId);

    return {
      personId: draft.personId,
      callsign: person?.callsign ?? null,
      name: fullName(person),
      inProgram: person?.inProgram ?? false,
      firstTripDay: draft.firstDay,
      windowTrips: draft.windowTrips,
      lastTripDay: draft.lastDay,
    };
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
      noNewcomers: false,
      retention,
      firstDays: { counted: true, ...firstDaysOf(windowRows, previousRows, asOfDay) },
      list: { counted: true, rows },
    },
    contacts,
  };
};
