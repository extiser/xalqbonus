import {
  listWinbackPeople,
  listWinbackSnapshotBands,
  readLastMetricMoneyRun,
  type WinbackPersonRow,
} from '#server/repositories/metrics';
import {
  METRICS_FIRST_DAY,
  WINBACK_BANDS,
  WINBACK_MANY_RIDES,
  WINBACK_RETURN_DAYS,
  WINBACK_SNAPSHOT_FROM,
  WINBACK_SNAPSHOTS,
  type WinbackBand,
} from '#server/services/metrics/constants';
import { monthPeriods } from '#server/services/metrics/monthPeriod';
import { coverageByMonth, isComplete } from '#server/services/metrics/periodCoverage';
import { shiftDayKey } from '#server/utils/parkTime';
import { shiftMonth } from '#shared/monthNames';
import type { DashboardWinbackBand, DashboardWinbackPool } from '#shared/types/dashboard';

/**
 * «Можно вернуть» на «Глубине» (issue #446) — docs/decisions.md → «Пул возврата на дашборде».
 * Только из готовых таблиц `metric_person_days`, `metric_person_prior` и `metric_person_months`:
 * транзакции не читаются.
 *
 * День отсчёта A — последний день выбранного месяца, у идущего — вчера. Последняя поездка
 * человека на A — последние сутки с поездкой не позже A, а нет таких в таблице — последние сутки
 * с комиссией до истории заказов. Полоса — по `A − последняя поездка` в сутках (`WINBACK_BANDS`).
 * «Ездил много» — `WINBACK_MANY_RIDES` оплаченных заказов и больше по месяц A включительно.
 *
 * Самовозврат полосы — по снимкам на 1-е число месяца, не раньше `WINBACK_SNAPSHOT_FROM`, у которых
 * окно возврата уже прошло к A; берутся последние `WINBACK_SNAPSHOTS`. Доля — вернувшиеся ÷
 * наблюдения по всем снимкам вместе.
 *
 * Цифры считаются, только если собраны все сутки поездок от начала истории по A — пропуск
 * сделал бы ездившего ушедшим — и был успешный прогон денег: без него поездок с апреля 2024 нет.
 */

/** Человек выгрузки: ушёл в одну из полос последнего года. */
export type WinbackCallPerson = WinbackPersonRow & {
  band: WinbackBand;
  /** Суток от последней поездки до дня отсчёта. */
  idleDays: number;
};

export type WinbackReport = {
  pool: DashboardWinbackPool;
  /** Ушедшие за последний год по порядку выгрузки; `null` — цифр нет. */
  callList: WinbackCallPerson[] | null;
};

/** Целых суток от `from` до `to`. */
const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Полоса по суткам от последней поездки; меньше первой границы — не ушёл. */
const bandOf = (idleDays: number): WinbackBand | null =>
  WINBACK_BANDS.findLast((band) => idleDays >= band.fromDays) ?? null;

const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null;

  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

/** Доля процентом, как на экране: целым, ниже 1 % — до десятой. Наблюдений нет — доли нет. */
const selfReturnPercent = (returned: number, observed: number): number | null => {
  if (observed === 0) return null;

  const percent = (returned / observed) * 100;

  return percent >= 1 ? Math.round(percent) : Math.round(percent * 10) / 10;
};

/**
 * Снимки самовозврата на день отсчёта: первые числа месяцев с `WINBACK_SNAPSHOT_FROM`, у которых
 * последние сутки окна возврата не позже A, — последние `WINBACK_SNAPSHOTS`.
 */
export const winbackSnapshots = (asOfDay: string): string[] => {
  const snapshots: string[] = [];

  for (
    let month = WINBACK_SNAPSHOT_FROM.slice(0, 7);
    shiftDayKey(`${month}-01`, WINBACK_RETURN_DAYS - 1) <= asOfDay;
    month = shiftMonth(month, 1)
  ) {
    snapshots.push(`${month}-01`);
  }

  return snapshots.slice(-WINBACK_SNAPSHOTS);
};

/** Порядок выгрузки: сначала ездившие много, внутри — недавно ушедшие сверху. */
const compareCallPeople = (first: WinbackCallPerson, second: WinbackCallPerson): number => {
  const byMany = Number(second.rides >= WINBACK_MANY_RIDES) - Number(first.rides >= WINBACK_MANY_RIDES);

  return byMany || first.idleDays - second.idleDays || (first.personId < second.personId ? -1 : 1);
};

const emptyBand = (band: WinbackBand): DashboardWinbackBand => ({
  key: band.key,
  people: null,
  many: null,
  selfReturnPercent: null,
});

export const readWinback = async (month: string, now: Date = new Date()): Promise<WinbackReport> => {
  const asOfDay = monthPeriods(month, now).period.to;

  const [coverage, lastRun] = await Promise.all([
    coverageByMonth(METRICS_FIRST_DAY, asOfDay),
    readLastMetricMoneyRun(),
  ]);

  const base = { asOfDay, coverage, computedAt: lastRun?.finishedAt.toISOString() ?? null };

  if (lastRun === null || !isComplete(coverage)) {
    return {
      pool: {
        ...base,
        leftYear: null,
        leftYearMany: null,
        bands: WINBACK_BANDS.map(emptyBand),
        overYearMedianRides: null,
      },
      callList: null,
    };
  }

  const [people, snapshotBands] = await Promise.all([
    listWinbackPeople(asOfDay, `${asOfDay.slice(0, 7)}-01`),
    listWinbackSnapshotBands(
      winbackSnapshots(asOfDay),
      WINBACK_BANDS.map((band) => band.fromDays),
      WINBACK_RETURN_DAYS,
    ),
  ]);

  const left: WinbackCallPerson[] = [];

  for (const person of people) {
    const idleDays = daysBetween(person.lastDay, asOfDay);
    const band = bandOf(idleDays);

    if (band !== null) left.push({ ...person, band, idleDays });
  }

  const bands = WINBACK_BANDS.map((band, index): DashboardWinbackBand => {
    const inBand = left.filter((person) => person.band.key === band.key);
    // Полосы в выборке снимков — по номеру `width_bucket`, с единицы.
    const snapshot = snapshotBands.find((row) => row.band === index + 1);

    return {
      key: band.key,
      people: inBand.length,
      many: inBand.filter((person) => person.rides >= WINBACK_MANY_RIDES).length,
      selfReturnPercent: snapshot === undefined ? null : selfReturnPercent(snapshot.returned, snapshot.observed),
    };
  });

  const callList = left.filter((person) => person.band.inYear).sort(compareCallPeople);
  const overYearRides = left.filter((person) => !person.band.inYear).map((person) => person.rides);
  const overYearMedian = median(overYearRides);

  return {
    pool: {
      ...base,
      leftYear: callList.length,
      leftYearMany: callList.filter((person) => person.rides >= WINBACK_MANY_RIDES).length,
      bands,
      overYearMedianRides: overYearMedian === null ? null : Math.round(overYearMedian),
    },
    callList,
  };
};

export const readWinbackPool = async (month: string, now: Date = new Date()): Promise<DashboardWinbackPool> =>
  (await readWinback(month, now)).pool;
