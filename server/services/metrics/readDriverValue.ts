import {
  listDriverValueGroups,
  readDriverValueNewcomers,
  readLastMetricMoneyRun,
  type DriverValueGroupRow,
} from '#server/repositories/metrics';
import { DRIVER_VALUE_NEWCOMER_FROM, LEADERS_SHARE } from '#server/services/metrics/constants';
import { moneyCoverageByMonth } from '#server/services/metrics/moneyCoverage';
import {
  FIRST_MONEY_MONTH,
  isMoneyComplete,
  laterMonth,
  monthDate,
  readValueRates,
  valueMonthOf,
  YEAR_MONTHS,
  yearCohorts,
} from '#server/services/metrics/personMonthValue';
import { shiftMonth } from '#shared/monthNames';
import type {
  DashboardDriverValue,
  DashboardDriverValueGroup,
  DashboardDriverValueNewcomer,
} from '#shared/types/dashboard';

/**
 * «Цена водителя за год» на «Глубине» (issue #442) — docs/decisions.md → «Цена водителя
 * на дашборде». Только из готовой таблицы `metric_person_months`: транзакции не читаются.
 *
 * Месяц плитки T — выбранный закрытый или, у идущего, прошлый: идущий показывает последний
 * закрытый, как поток и новички. Ставки — месяца T: основная = комиссия ÷ оплата вне окна ставки
 * новичка, новичка — внутри; оплаты новичков в T нет — ставка новичка равна основной.
 *
 * Наборы «за год» — месяцы T − 23 … T − 12, «за два года» — T − 35 … T − 24, не раньше первого
 * месяца денег. Лидер месяца — верхние `LEADERS_SHARE` людей месяца по заказам. Новичок набора m —
 * человек с первой строкой в таблице в m, наборы — не раньше `DRIVER_VALUE_NEWCOMER_FROM`.
 *
 * Цифры считаются, только если собраны все сутки от первого месяца наборов по конец T: пропуск
 * суток дал бы ушедшему нули, а лидеров выбрал бы по неполному месяцу.
 *
 * Месяц плитки, окно «за год» и ставки — общие с «Окупается ли найм» (`personMonthValue.ts`).
 */

/** Групп у `ntile`: лидеры — первая из них. */
const LEADER_TILES = Math.round(1 / LEADERS_SHARE);

const TWO_YEARS_MONTHS = 24;

const percent = (part: number, whole: number): number | null =>
  whole > 0 ? Math.round((part / whole) * 100) : null;

const roundOrNull = (value: number | null): number | null => (value === null ? null : Math.round(value));

const EMPTY_GROUP: DashboardDriverValueGroup = {
  people: null,
  value12: null,
  value24: null,
  ridingAfterYearPercent: null,
};

const EMPTY_NEWCOMER: DashboardDriverValueNewcomer = {
  people: null,
  value12: null,
  median12: null,
  ridingAfterYearPercent: null,
  becameLeaderPercent: null,
  monthsToLeader: null,
};

const groupOf = (
  yearRows: readonly DriverValueGroupRow[],
  twoYearRows: readonly DriverValueGroupRow[] | null,
  leader: boolean,
): DashboardDriverValueGroup => {
  const year = yearRows.find((row) => row.leader === leader);
  const twoYears = twoYearRows?.find((row) => row.leader === leader);

  if (year === undefined) return { ...EMPTY_GROUP, people: 0 };

  return {
    people: year.people,
    value12: Math.round(year.value),
    value24: twoYears === undefined ? null : Math.round(twoYears.value),
    ridingAfterYearPercent: percent(year.ridingAfterYear, year.people),
  };
};

export const readDriverValue = async (month: string, now: Date = new Date()): Promise<DashboardDriverValue> => {
  const { month: valueMonth, ongoing } = valueMonthOf(month, now);
  const { from: cohortsFrom, to: cohortsTo } = yearCohorts(valueMonth);
  const twoYearsFrom = laterMonth(shiftMonth(valueMonth, -(3 * YEAR_MONTHS - 1)), FIRST_MONEY_MONTH);
  const twoYearsTo = shiftMonth(valueMonth, -TWO_YEARS_MONTHS);
  const hasTwoYears = twoYearsTo >= twoYearsFrom;
  const newcomersFrom = laterMonth(cohortsFrom, DRIVER_VALUE_NEWCOMER_FROM);

  const lastRun = await readLastMetricMoneyRun();
  const coverage = await moneyCoverageByMonth(
    hasTwoYears ? twoYearsFrom : cohortsFrom,
    valueMonth,
    lastRun?.daysTo ?? null,
  );

  const base = {
    month: valueMonth,
    ongoing,
    cohortsFrom,
    cohortsTo,
    computedAt: lastRun?.finishedAt.toISOString() ?? null,
    coverage,
  };

  const pricing = isMoneyComplete(coverage) ? await readValueRates(valueMonth) : null;

  if (pricing === null) {
    return {
      ...base,
      rates: { main: null, newcomer: null },
      leader: EMPTY_GROUP,
      others: EMPTY_GROUP,
      newcomer: EMPTY_NEWCOMER,
    };
  }

  const [yearRows, twoYearRows, newcomers] = await Promise.all([
    listDriverValueGroups(
      {
        fromMonth: monthDate(cohortsFrom),
        toMonth: monthDate(cohortsTo),
        horizonMonths: YEAR_MONTHS,
        leaderTiles: LEADER_TILES,
      },
      pricing,
    ),
    hasTwoYears
      ? listDriverValueGroups(
          {
            fromMonth: monthDate(twoYearsFrom),
            toMonth: monthDate(twoYearsTo),
            horizonMonths: TWO_YEARS_MONTHS,
            leaderTiles: LEADER_TILES,
          },
          pricing,
        )
      : Promise.resolve(null),
    newcomersFrom <= cohortsTo
      ? readDriverValueNewcomers(
          { fromMonth: monthDate(newcomersFrom), toMonth: monthDate(cohortsTo), leaderTiles: LEADER_TILES },
          pricing,
        )
      : Promise.resolve(null),
  ]);

  return {
    ...base,
    rates: pricing.rates,
    leader: groupOf(yearRows, twoYearRows, true),
    others: groupOf(yearRows, twoYearRows, false),
    newcomer:
      newcomers === null
        ? { ...EMPTY_NEWCOMER, people: 0 }
        : {
            people: newcomers.people,
            value12: roundOrNull(newcomers.value),
            median12: roundOrNull(newcomers.median),
            ridingAfterYearPercent: percent(newcomers.ridingAfterYear, newcomers.people),
            becameLeaderPercent: percent(newcomers.becameLeader, newcomers.people),
            monthsToLeader:
              newcomers.monthsToLeader === null ? null : Math.round(newcomers.monthsToLeader * 10) / 10,
          },
  };
};
