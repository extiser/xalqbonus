import {
  formatCommissionPair,
  formatCompactSum,
  formatNumber,
  formatSignedCompactSum,
  formatSignedNumber,
  formatSignedPercent,
  formatTenths,
  formatWholePercent,
  pluralize,
} from '#shared/numberFormat';
import type {
  DashboardContributions,
  DashboardMoneyContributions,
  DashboardMoneyValues,
  DashboardMultipliers,
} from '#shared/types/dashboard';

/**
 * Выводы словами под плитками дашборда (issue #383): одно-два предложения, которые читают
 * числа плитки за человека. Собирает код по правилам, без языковой модели.
 *
 * Правила, формулировки и пороги — таблицы `_reference/design/web/dashboard/conclusions.md`.
 * Документ — эталон (docs/infra.md → «Тесты», четвёртое
 * исключение): поменялось правило — первым правится он, затем тест, и только потом код.
 *
 * Решения сверх таблиц (pre-flight #383): из двух подходящих довесков
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

/**
 * Изменение дохода меньше этой доли от базы, в процентах, — «почти такой же». Раздел
 * «Деньги — „Почему изменилось“» в `_reference/design/web/dashboard/conclusions.md`.
 */
export const INCOME_FLAT_PERCENT = 2;

/**
 * Второй главный множитель — вклад того же знака не меньше этой части вклада главного: половина.
 * Тот же раздел `conclusions.md`.
 */
export const SECOND_FACTOR_SHARE_DIVISOR = 2;

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

/**
 * Изменение на линии меньше этой доли водителей на линии в прошлом месяце, в процентах, —
 * «почти столько же». Таблица «Первое предложение — итог», раздел «Поток водителей — панель
 * месяца» в `_reference/design/web/dashboard/conclusions.md`.
 */
export const FLOW_FLAT_PERCENT = 2;

export type DriverFlowConclusionInput = {
  newDrivers: number;
  returned: number;
  left: number;
  /** Водителей на линии в прошлом месяце — только для порога, в текст не попадает. */
  previousOnLine: number;
  /** Собраны не все сутки у месяца или у прошлого. */
  incomplete: boolean;
};

/** Первое предложение — итог. При `D₀ = 0` порог не применяется: Δ = 0 — «почти столько же». */
const flowTotalSentence = (input: DriverFlowConclusionInput): string => {
  const came = input.newDrivers + input.returned;
  const change = came - input.left;
  const flat = input.previousOnLine > 0 ? Math.abs(change) * 100 < FLOW_FLAT_PERCENT * input.previousOnLine : change === 0;

  if (flat) {
    return `Водителей на линии почти столько же: пришло ${formatNumber(came)}, ушло ${formatNumber(input.left)}.`;
  }

  const drivers = pluralize(change, 'водителя', 'водителей', 'водителей');

  return change > 0
    ? `На линии на ${formatNumber(change)} ${drivers} больше: пришло ${formatNumber(came)}, ушло ${formatNumber(input.left)}.`
    : `На линии на ${formatNumber(Math.abs(change))} ${drivers} меньше: ушло ${formatNumber(input.left)}, пришло ${formatNumber(came)}.`;
};

/** Второе — за счёт кого. При `N + R < L` его нет. */
const flowSourceSentence = (input: DriverFlowConclusionInput): string | null => {
  if (input.newDrivers >= input.left) {
    return `Одни новые перекрывают ушедших: ${formatNumber(input.newDrivers)} против ${formatNumber(input.left)}.`;
  }

  return input.left <= input.newDrivers + input.returned
    ? `Новых меньше, чем ушедших: убыль закрыли вернувшиеся — ${formatNumber(input.returned)}.`
    : null;
};

/**
 * Вывод под панелью месяца «Потока водителей» (issue #398). `null` — вывода нет: у месяца
 * или у прошлого собраны не все сутки. Панели нет вовсе (октябрь 2025) — функция не зовётся.
 */
export const driverFlowConclusion = (input: DriverFlowConclusionInput): string | null => {
  if (input.incomplete) {
    return null;
  }

  const source = flowSourceSentence(input);
  const total = flowTotalSentence(input);

  return source === null ? total : `${total} ${source}`;
};

type MoneyFactorKey = 'orders' | 'paymentPerOrder' | 'commission';

/** Порядок множителей в уравнении; при равных вкладах главным берётся тот, что левее. */
const MONEY_FACTOR_KEYS: readonly MoneyFactorKey[] = ['orders', 'paymentPerOrder', 'commission'];

/** Фраза множителя без «Главное —» по знаку вклада — вторая таблица раздела «Деньги». */
const MONEY_FACTOR_PHRASES: Readonly<Record<MoneyFactorKey, { up: string; down: string }>> = {
  orders: { up: 'заказов больше', down: 'заказов меньше' },
  paymentPerOrder: { up: 'заказы подорожали', down: 'заказы подешевели' },
  commission: { up: 'парк берёт большую долю оплаты', down: 'парк берёт меньшую долю оплаты' },
};

/**
 * Значения множителя — как на карточках: заказы и оплата на заказ целым, комиссия до сотой,
 * а если у периода и базы до сотой она одна — до тысячной.
 */
const moneyFactorValues = (
  key: MoneyFactorKey,
  current: DashboardMoneyValues,
  base: DashboardMoneyValues,
): string => {
  if (key === 'orders') {
    return `${formatNumber(Math.round(current.orders))} против ${formatNumber(Math.round(base.orders))}`;
  }

  if (key === 'paymentPerOrder') {
    return `${formatNumber(Math.round(current.paymentPerOrder))} против ${formatNumber(Math.round(base.paymentPerOrder))} сум`;
  }

  const commission = formatCommissionPair(current.commission, base.commission);

  return `${commission.current}\u00a0% против ${commission.base ?? ''}\u00a0%`;
};

/** Точка в конце предложения — одна: сумма «39,7 тыс.» свою уже несёт. */
const endSentence = (text: string): string => (text.endsWith('.') ? text : `${text}.`);

const moneyFactorPhrase = (key: MoneyFactorKey, contribution: number): string =>
  contribution > 0 ? MONEY_FACTOR_PHRASES[key].up : MONEY_FACTOR_PHRASES[key].down;

/** Множитель «Денег» с наибольшим по модулю вкладом среди подходящих; нет таких — `null`. */
const largestMoneyFactor = (
  contributions: DashboardMoneyContributions,
  fits: (key: MoneyFactorKey, contribution: number) => boolean,
): MoneyFactorKey | null => {
  let largest: MoneyFactorKey | null = null;

  for (const key of MONEY_FACTOR_KEYS) {
    const contribution = contributions[key];

    if (fits(key, contribution) && (largest === null || Math.abs(contribution) > Math.abs(contributions[largest]))) {
      largest = key;
    }
  }

  return largest;
};

export type MoneyConclusionInput = {
  current: DashboardMoneyValues;
  /** `null` — базы нет. */
  base: DashboardMoneyValues | null;
  /** `null` — разложения нет. */
  contributions: DashboardMoneyContributions | null;
  /** Сравнение в сутки: «Доход в сутки» вместо «Доход». */
  perDay: boolean;
  /** «к сентябрю 2025», «к августу». */
  toBase: string;
  /** «в сентябре 2025», «в августе». */
  inBase: string;
  /** У периода собраны все сутки. */
  periodComplete: boolean;
  /** У базы собраны все сутки. */
  baseComplete: boolean;
};

/**
 * Вывод под уравнением «Почему изменилось» вкладки «Деньги» (issue #438) — устроен как вывод
 * множителей поездок, со вторым главным множителем. `null` — вывода нет: базы нет, в ней дохода
 * ноль или у периода либо базы собраны не все сутки.
 *
 * Доход сравнивается целым сумом — тем, что разложено; суммы во фразе — сокращённо, как на плитке.
 */
export const moneyConclusion = (input: MoneyConclusionInput): string | null => {
  const { current, base, contributions } = input;

  if (base === null || base.income <= 0 || !input.periodComplete || !input.baseComplete) {
    return null;
  }

  const subject = input.perDay ? 'Доход в сутки' : 'Доход';
  const change = current.income - base.income;

  if (Math.abs(change) * 100 < INCOME_FLAT_PERCENT * base.income) {
    return endSentence(`${subject} почти такой же, как ${input.inBase}: ${formatSignedCompactSum(change)}`);
  }

  const share = formatSignedPercent((change / base.income) * 100);
  const trend =
    change > 0
      ? `${subject} больше на ${formatCompactSum(change)} (${share}) ${input.toBase}.`
      : `${subject} меньше на ${formatCompactSum(Math.abs(change))} (${share}) ${input.toBase}.`;

  if (contributions === null) {
    return trend;
  }

  const main = largestMoneyFactor(contributions, (_key, contribution) => contribution * change > 0);

  if (main === null) {
    return trend;
  }

  const mainContribution = contributions[main];
  const second = largestMoneyFactor(
    contributions,
    (key, contribution) =>
      key !== main &&
      contribution * change > 0 &&
      Math.abs(contribution) * SECOND_FACTOR_SHARE_DIVISOR >= Math.abs(mainContribution),
  );
  const counter = largestMoneyFactor(
    contributions,
    (_key, contribution) =>
      contribution * change < 0 && Math.abs(contribution) * COUNTER_SHARE_DIVISOR >= Math.abs(change),
  );

  const clause = (key: MoneyFactorKey): string =>
    `${moneyFactorPhrase(key, contributions[key])}: ${moneyFactorValues(key, current, base)}`;
  const lever = second === null ? `Главное — ${clause(main)}` : `Главное — ${clause(main)}, и ${clause(second)}`;

  if (counter === null) {
    return `${trend} ${lever}.`;
  }

  return endSentence(
    `${trend} ${lever}; против — ${moneyFactorPhrase(counter, contributions[counter])}: ${formatSignedCompactSum(contributions[counter])}`,
  );
};
