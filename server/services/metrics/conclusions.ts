import {
  formatNumber,
  formatSignedNumber,
  formatSignedPercent,
  formatTenths,
  formatWholePercent,
  pluralize,
} from '#shared/numberFormat';
import type { DashboardContributions, DashboardMultipliers } from '#shared/types/dashboard';

/**
 * Выводы словами под плитками дашборда (issue #383): одно-два предложения, которые читают
 * числа плитки за человека. Собирает код по правилам, без языковой модели.
 *
 * Правила, формулировки и пороги — таблицы `_reference/design/web/dashboard/conclusions.md`,
 * утверждены Русланом 05-10-2026. Документ — эталон (docs/infra.md → «Тесты», четвёртое
 * исключение): поменялось правило — первым правится он, затем тест, и только потом код.
 *
 * Решения Руслана сверх таблиц (pre-flight #383, 05-10-2026): из двух подходящих довесков
 * «против» берётся один, наибольший по модулю; слово при числе склоняется; при 0 заказах
 * в цене балла второго предложения нет; при выданном ≤ 0 и потраченном не ноль нет первого.
 *
 * Пороги сравниваются в целых, а не долями: граница «ровно 2 %» не должна зависеть
 * от погрешности деления.
 */

/** Изменение поездок меньше этой доли от базы, в процентах, — «почти столько же». */
export const TRIPS_FLAT_PERCENT = 2;

/** Довесок «против» — вклад не меньше этой части `|Δ|`: четверть. */
export const COUNTER_SHARE_DIVISOR = 4;

/** Изменение долга меньше этой доли выданного, в процентах, — «почти не изменился». */
export const DEBT_FLAT_PERCENT = 1;

/** Цене балла меньше чем по стольким заказам верить рано. */
export const POINT_COST_TRUSTED_ORDERS = 10;

type FactorKey = 'driversOnLine' | 'daysOnLine' | 'tripsPerDay';

/** Порядок множителей на плитке; при равных вкладах главным берётся тот, что левее. */
const FACTOR_KEYS: readonly FactorKey[] = ['driversOnLine', 'daysOnLine', 'tripsPerDay'];

/** Фраза множителя без «Главное —» по знаку вклада — вторая таблица `conclusions.md`. */
const FACTOR_PHRASES: Readonly<Record<FactorKey, { up: string; down: string }>> = {
  driversOnLine: {
    up: 'на линию вышло больше водителей',
    down: 'на линию вышло меньше водителей',
  },
  daysOnLine: {
    up: 'водители выходили чаще',
    down: 'водители выходили реже',
  },
  tripsPerDay: {
    up: 'за день делают больше поездок',
    down: 'за день делают меньше поездок',
  },
};

/**
 * «431 против 413», «17,4 дня против 16,9». Дни — всегда с десятой, а при дробном числе
 * форма одна: «дня».
 */
const factorValues = (key: FactorKey, current: DashboardMultipliers, base: DashboardMultipliers): string => {
  if (key === 'driversOnLine') {
    return `${formatNumber(current.driversOnLine)} против ${formatNumber(base.driversOnLine)}`;
  }

  if (key === 'daysOnLine') {
    return `${formatTenths(current.daysOnLine)} дня против ${formatTenths(base.daysOnLine)}`;
  }

  return `${formatTenths(current.tripsPerDay)} против ${formatTenths(base.tripsPerDay)}`;
};

const factorPhrase = (key: FactorKey, contribution: number): string =>
  contribution > 0 ? FACTOR_PHRASES[key].up : FACTOR_PHRASES[key].down;

/** Множитель с наибольшим по модулю вкладом среди подходящих; нет таких — `null`. */
const largestFactor = (
  contributions: DashboardContributions,
  fits: (contribution: number) => boolean,
): FactorKey | null => {
  let largest: FactorKey | null = null;

  for (const key of FACTOR_KEYS) {
    const contribution = contributions[key];

    if (fits(contribution) && (largest === null || Math.abs(contribution) > Math.abs(contributions[largest]))) {
      largest = key;
    }
  }

  return largest;
};

export type MultipliersConclusionInput = {
  current: DashboardMultipliers;
  /** `null` — базы нет. */
  base: DashboardMultipliers | null;
  /** `null` — разложения нет: в текущем периоде поездок ноль. */
  contributions: DashboardContributions | null;
  /** «к сентябрю», «к 1–4 сентября». */
  toBase: string;
  /** «в сентябре», «в 1–4 сентября». */
  inBase: string;
  /** У периода собраны все сутки. */
  periodComplete: boolean;
  /** У базы собраны все сутки. */
  baseComplete: boolean;
};

/**
 * Вывод под множителями — «За счёт чего изменились поездки». `null` — вывода нет: базы нет,
 * в ней ноль поездок или у периода либо базы собраны не все сутки.
 */
export const multipliersConclusion = (input: MultipliersConclusionInput): string | null => {
  const { current, base, contributions } = input;

  if (base === null || base.trips <= 0 || !input.periodComplete || !input.baseComplete) {
    return null;
  }

  const change = current.trips - base.trips;

  if (Math.abs(change) * 100 < TRIPS_FLAT_PERCENT * base.trips) {
    return `Поездок почти столько же, сколько ${input.inBase}: ${formatSignedNumber(change)}.`;
  }

  const share = formatSignedPercent((change / base.trips) * 100);
  const trend =
    change > 0
      ? `Поездок больше на ${formatNumber(change)} (${share}) ${input.toBase}.`
      : `Поездок меньше на ${formatNumber(Math.abs(change))} (${share}) ${input.toBase}.`;

  if (contributions === null) {
    return trend;
  }

  const main = largestFactor(contributions, (contribution) => contribution * change > 0);

  if (main === null) {
    return trend;
  }

  const counter = largestFactor(
    contributions,
    (contribution) =>
      contribution * change < 0 && Math.abs(contribution) * COUNTER_SHARE_DIVISOR >= Math.abs(change),
  );

  const lever = `Главное — ${factorPhrase(main, contributions[main])}: ${factorValues(main, current, base)}`;

  if (counter === null) {
    return `${trend} ${lever}.`;
  }

  const counterContribution = contributions[counter];
  const counterTrips = pluralize(counterContribution, 'поездка', 'поездки', 'поездок');

  return `${trend} ${lever}; против — ${factorPhrase(counter, counterContribution)}: ${formatSignedNumber(counterContribution)} ${counterTrips}.`;
};

export type ProgramEconomyConclusionInput = {
  issued: number;
  spent: number;
  /** Потрачено ÷ выдано процентом до целого; `null` — ничего не выдано. */
  redemptionPercent: number | null;
  debtPointsChange: number;
  pointCostOrders: number;
  /** Сколько суток в периоде. */
  days: number;
  /** Текущий месяц, ещё не кончился. */
  partial: boolean;
};

/** Первое предложение — долг, без начала «За месяц» / «За k дней месяца». */
const debtClause = (input: ProgramEconomyConclusionInput): string | null => {
  const { issued, spent, debtPointsChange: change } = input;

  if (issued === 0 && spent === 0) {
    return 'баллы не выдавались и не тратились.';
  }

  if (issued <= 0 || input.redemptionPercent === null) {
    return null;
  }

  if (Math.abs(change) * 100 < DEBT_FLAT_PERCENT * issued) {
    return 'долг по баллам почти не изменился: выдали столько же, сколько потратили.';
  }

  return change > 0
    ? `долг по баллам вырос на ${formatNumber(change)}: выдали больше, чем потратили — выкуп ${formatWholePercent(input.redemptionPercent)}.`
    : `долг по баллам снизился на ${formatNumber(Math.abs(change))}: потратили больше, чем выдали.`;
};

/**
 * Начало первого предложения. У неполного месяца — «За 4 дня месяца»; у полного «За месяц»
 * стоит только у строки «баллы не выдавались», остальные начинаются с «Долг».
 */
const debtSentence = (input: ProgramEconomyConclusionInput): string | null => {
  const clause = debtClause(input);

  if (clause === null) {
    return null;
  }

  if (input.partial) {
    return `За ${input.days} ${pluralize(input.days, 'день', 'дня', 'дней')} месяца ${clause}`;
  }

  if (input.issued === 0 && input.spent === 0) {
    return `За месяц ${clause}`;
  }

  return `${clause.charAt(0).toUpperCase()}${clause.slice(1)}`;
};

/** Второе — доверие к цене балла. При 0 заказах цены нет вовсе, и плитка это уже говорит. */
const pointCostSentence = (orders: number): string | null =>
  orders > 0 && orders < POINT_COST_TRUSTED_ORDERS
    ? `Цене балла пока рано верить: посчитана по ${formatNumber(orders)} ${pluralize(orders, 'заказу', 'заказам', 'заказам')}.`
    : null;

/** Вывод под «Экономикой программы». `null` — ни одно правило не дало предложения. */
export const programEconomyConclusion = (input: ProgramEconomyConclusionInput): string | null => {
  const sentences = [debtSentence(input), pointCostSentence(input.pointCostOrders)].filter(
    (sentence): sentence is string => sentence !== null,
  );

  return sentences.length > 0 ? sentences.join(' ') : null;
};
