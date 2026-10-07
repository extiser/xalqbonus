import type {
  DriverFlowConclusionInput,
  MultipliersConclusionInput,
  ProgramEconomyConclusionInput,
} from '#server/services/metrics/conclusions';

/**
 * Эталон выводов словами под плитками дашборда — таблицы
 * `_reference/design/web/dashboard/conclusions.md`, по случаю на каждую строку и на каждое
 * правило «вывода нет» (docs/infra.md → «Тесты», четвёртое исключение). Поменялось правило —
 * первым правится документ, затем эта копия, и только потом код.
 *
 * Пробелы: в документе они обычные, на экране — неразрывные, как у всех чисел плитки (pre-flight
 * #383): между разрядами и перед «%». Здесь неразрывный записан явно —
 * `\u00a0`, чтобы его было видно; в остальном строки совпадают с документом до символа.
 *
 * Кроме строк таблиц — решения, принятые в pre-flight #383: склонение
 * при числе, один довесок «против», 0 заказов в цене балла, выдано ≤ 0, поездок в базе ноль.
 * У потока водителей (issue #398) — границы из issue: ровно 2 %, `L = N + R`, `N = L`, `D₀ = 0`,
 * склонение при 1 и 21.
 */

export type ConclusionCase<Input> = {
  /** Строка таблицы или правило, которое проверяет случай. */
  rule: string;
  input: Input;
  expected: string | null;
};

const SEPTEMBER = { toBase: 'к сентябрю', inBase: 'в сентябре' };

const COMPLETE = { periodComplete: true, baseComplete: true };

/** Цифры макета `02-levers.html`: 83 120 поездок против 79 400. */
const MOCKUP: MultipliersConclusionInput = {
  current: { trips: 83_120, driversOnLine: 431, daysOnLine: 17.4, tripsPerDay: 11.1 },
  base: { trips: 79_400, driversOnLine: 413, daysOnLine: 17.1, tripsPerDay: 11.2 },
  contributions: { driversOnLine: 3_466, daysOnLine: 1_413, tripsPerDay: -1_159, total: 3_720 },
  ...SEPTEMBER,
  ...COMPLETE,
};

/** База в 10 000 поездок: доля в процентах читается по Δ без деления в уме. */
const BASE = { trips: 10_000, driversOnLine: 400, daysOnLine: 17.1, tripsPerDay: 1.4 };

const tenThousand = (
  trips: number,
  current: Partial<MultipliersConclusionInput['current']>,
  contributions: Omit<MultipliersConclusionInput['contributions'] & object, 'total'>,
): MultipliersConclusionInput => ({
  current: { ...BASE, trips, ...current },
  base: BASE,
  contributions: { ...contributions, total: trips - BASE.trips },
  ...SEPTEMBER,
  ...COMPLETE,
});

export const MULTIPLIERS_CASES: readonly ConclusionCase<MultipliersConclusionInput>[] = [
  // Пример документа — отдельным случаем, текст до символа.
  {
    rule: 'пример на цифрах макета',
    input: MOCKUP,
    expected:
      'Поездок больше на 3\u00a0720 (+4,7\u00a0%) к сентябрю. Главное — на линию вышло больше водителей: 431 против 413; против — за день делают меньше поездок: −1\u00a0159 поездок.',
  },

  // Первая таблица — что с поездками.
  {
    rule: '|доля| < 2 %, рост',
    input: tenThousand(10_150, {}, { driversOnLine: 150, daysOnLine: 0, tripsPerDay: 0 }),
    expected: 'Поездок почти столько же, сколько в сентябре: +150.',
  },
  {
    rule: '|доля| < 2 %, спад',
    input: tenThousand(9_801, {}, { driversOnLine: -199, daysOnLine: 0, tripsPerDay: 0 }),
    expected: 'Поездок почти столько же, сколько в сентябре: −199.',
  },
  {
    rule: '|доля| < 2 %, без изменения — «+0», как в карточке «всего»',
    input: tenThousand(10_000, {}, { driversOnLine: 0, daysOnLine: 0, tripsPerDay: 0 }),
    expected: 'Поездок почти столько же, сколько в сентябре: +0.',
  },
  {
    rule: 'Δ > 0, неполная база — «к 1–4 сентября»',
    input: {
      ...tenThousand(10_500, { driversOnLine: 420 }, { driversOnLine: 500, daysOnLine: 0, tripsPerDay: 0 }),
      toBase: 'к 1–4 сентября',
      inBase: 'в 1–4 сентября',
    },
    expected: 'Поездок больше на 500 (+5,0\u00a0%) к 1–4 сентября. Главное — на линию вышло больше водителей: 420 против 400.',
  },
  {
    rule: 'Δ < 0',
    input: tenThousand(8_765, { driversOnLine: 350 }, { driversOnLine: -1_235, daysOnLine: 0, tripsPerDay: 0 }),
    expected: 'Поездок меньше на 1\u00a0235 (−12,4\u00a0%) к сентябрю. Главное — на линию вышло меньше водителей: 350 против 400.',
  },

  // Вторая таблица — главный рычаг, по строке на множитель и знак.
  {
    rule: 'водители, +',
    input: tenThousand(10_600, { driversOnLine: 424 }, { driversOnLine: 600, daysOnLine: 0, tripsPerDay: 0 }),
    expected: 'Поездок больше на 600 (+6,0\u00a0%) к сентябрю. Главное — на линию вышло больше водителей: 424 против 400.',
  },
  {
    rule: 'водители, −',
    input: tenThousand(9_400, { driversOnLine: 376 }, { driversOnLine: -600, daysOnLine: 0, tripsPerDay: 0 }),
    expected: 'Поездок меньше на 600 (−6,0\u00a0%) к сентябрю. Главное — на линию вышло меньше водителей: 376 против 400.',
  },
  {
    rule: 'дни, +',
    input: tenThousand(10_300, { daysOnLine: 17.6 }, { driversOnLine: 10, daysOnLine: 290, tripsPerDay: 0 }),
    expected: 'Поездок больше на 300 (+3,0\u00a0%) к сентябрю. Главное — водители выходили чаще: 17,6 дня против 17,1.',
  },
  {
    rule: 'дни, −',
    input: tenThousand(9_700, { daysOnLine: 16.6 }, { driversOnLine: -10, daysOnLine: -290, tripsPerDay: 0 }),
    expected: 'Поездок меньше на 300 (−3,0\u00a0%) к сентябрю. Главное — водители выходили реже: 16,6 дня против 17,1.',
  },
  {
    rule: 'поездки в день, +',
    input: tenThousand(10_400, { tripsPerDay: 1.52 }, { driversOnLine: 0, daysOnLine: 0, tripsPerDay: 400 }),
    expected: 'Поездок больше на 400 (+4,0\u00a0%) к сентябрю. Главное — за день делают больше поездок: 1,5 против 1,4.',
  },
  {
    rule: 'поездки в день, −',
    input: tenThousand(9_000, { tripsPerDay: 1.26 }, { driversOnLine: 0, daysOnLine: 0, tripsPerDay: -1_000 }),
    expected: 'Поездок меньше на 1\u00a0000 (−10,0\u00a0%) к сентябрю. Главное — за день делают меньше поездок: 1,3 против 1,4.',
  },

  // Довесок «против».
  {
    rule: 'довесок: вклад ровно четверть |Δ| — пишется',
    input: tenThousand(10_400, { driversOnLine: 420 }, { driversOnLine: 500, daysOnLine: -100, tripsPerDay: 0 }),
    expected:
      'Поездок больше на 400 (+4,0\u00a0%) к сентябрю. Главное — на линию вышло больше водителей: 420 против 400; против — водители выходили реже: −100 поездок.',
  },
  {
    rule: 'довесок: вклад меньше четверти |Δ| — не пишется',
    input: tenThousand(10_400, { driversOnLine: 420 }, { driversOnLine: 499, daysOnLine: -99, tripsPerDay: 0 }),
    expected: 'Поездок больше на 400 (+4,0\u00a0%) к сентябрю. Главное — на линию вышло больше водителей: 420 против 400.',
  },
  {
    rule: 'довесок при спаде — вклад со знаком плюс',
    input: tenThousand(9_600, { driversOnLine: 370 }, { driversOnLine: -600, daysOnLine: 200, tripsPerDay: 0 }),
    expected:
      'Поездок меньше на 400 (−4,0\u00a0%) к сентябрю. Главное — на линию вышло меньше водителей: 370 против 400; против — водители выходили чаще: +200 поездок.',
  },
  {
    rule: 'довесок: подходят два — один, наибольший по модулю',
    input: tenThousand(10_400, { driversOnLine: 430 }, { driversOnLine: 800, daysOnLine: -150, tripsPerDay: -250 }),
    expected:
      'Поездок больше на 400 (+4,0\u00a0%) к сентябрю. Главное — на линию вышло больше водителей: 430 против 400; против — за день делают меньше поездок: −250 поездок.',
  },
  {
    rule: 'довесок: слово при числе склоняется — «−2 поездки»',
    input: {
      current: { trips: 108, driversOnLine: 11, daysOnLine: 10, tripsPerDay: 0.98 },
      base: { trips: 100, driversOnLine: 10, daysOnLine: 10, tripsPerDay: 1 },
      contributions: { driversOnLine: 10, daysOnLine: 0, tripsPerDay: -2, total: 8 },
      ...SEPTEMBER,
      ...COMPLETE,
    },
    expected:
      'Поездок больше на 8 (+8,0\u00a0%) к сентябрю. Главное — на линию вышло больше водителей: 11 против 10; против — за день делают меньше поездок: −2 поездки.',
  },

  // Граница 2 %.
  {
    rule: 'граница: доля ровно 2 % — уже «больше»',
    input: tenThousand(10_200, { driversOnLine: 408 }, { driversOnLine: 200, daysOnLine: 0, tripsPerDay: 0 }),
    expected: 'Поездок больше на 200 (+2,0\u00a0%) к сентябрю. Главное — на линию вышло больше водителей: 408 против 400.',
  },
  {
    rule: 'граница: доля ровно −2 % — уже «меньше»',
    input: tenThousand(9_800, { driversOnLine: 392 }, { driversOnLine: -200, daysOnLine: 0, tripsPerDay: 0 }),
    expected: 'Поездок меньше на 200 (−2,0\u00a0%) к сентябрю. Главное — на линию вышло меньше водителей: 392 против 400.',
  },

  // Разложения нет — только первое предложение.
  {
    rule: 'поездок в текущем периоде ноль — только первое предложение',
    input: {
      current: { trips: 0, driversOnLine: 0, daysOnLine: 0, tripsPerDay: 0 },
      base: BASE,
      contributions: null,
      ...SEPTEMBER,
      ...COMPLETE,
    },
    expected: 'Поездок меньше на 10\u00a0000 (−100,0\u00a0%) к сентябрю.',
  },

  // Вывода нет.
  {
    rule: 'вывода нет: базы нет',
    input: { ...MOCKUP, base: null, contributions: null },
    expected: null,
  },
  {
    rule: 'вывода нет: поездок в базе ноль',
    input: {
      ...MOCKUP,
      base: { trips: 0, driversOnLine: 0, daysOnLine: 0, tripsPerDay: 0 },
      contributions: null,
    },
    expected: null,
  },
  {
    rule: 'вывода нет: у периода собраны не все сутки',
    input: { ...MOCKUP, periodComplete: false },
    expected: null,
  },
  {
    rule: 'вывода нет: у базы собраны не все сутки',
    input: { ...MOCKUP, baseComplete: false },
    expected: null,
  },
];

/** Полный месяц, выдано 10 000, заказов в цене балла достаточно. */
const MONTH: ProgramEconomyConclusionInput = {
  issued: 10_000,
  spent: 6_000,
  redemptionPercent: 60,
  debtPointsChange: 4_000,
  pointCostOrders: 40,
  days: 30,
  partial: false,
};

export const PROGRAM_ECONOMY_CASES: readonly ConclusionCase<ProgramEconomyConclusionInput>[] = [
  // Пример документа — отдельным случаем, текст до символа.
  {
    rule: 'пример на копии за октябрь',
    input: {
      issued: 27_525,
      spent: 5_505,
      redemptionPercent: 20,
      debtPointsChange: 5_505,
      pointCostOrders: 5,
      days: 4,
      partial: true,
    },
    expected:
      'За 4 дня месяца долг по баллам вырос на 5\u00a0505: выдали больше, чем потратили — выкуп 20\u00a0%. Цене балла пока рано верить: посчитана по 5 заказам.',
  },

  // Первая таблица — долг.
  {
    rule: 'выдано = 0 и потрачено = 0',
    input: { ...MONTH, issued: 0, spent: 0, redemptionPercent: null, debtPointsChange: 0 },
    expected: 'За месяц баллы не выдавались и не тратились.',
  },
  {
    rule: 'выдано = 0 и потрачено = 0, неполный месяц',
    input: { ...MONTH, issued: 0, spent: 0, redemptionPercent: null, debtPointsChange: 0, days: 5, partial: true },
    expected: 'За 5 дней месяца баллы не выдавались и не тратились.',
  },
  {
    rule: '|Δдолга| < 1 % выданного',
    input: { ...MONTH, spent: 9_950, redemptionPercent: 100, debtPointsChange: 99 },
    expected: 'Долг по баллам почти не изменился: выдали столько же, сколько потратили.',
  },
  {
    rule: '|Δдолга| < 1 % выданного, снижение',
    input: { ...MONTH, spent: 10_050, redemptionPercent: 101, debtPointsChange: -99 },
    expected: 'Долг по баллам почти не изменился: выдали столько же, сколько потратили.',
  },
  {
    rule: 'Δдолга > 0',
    input: MONTH,
    expected: 'Долг по баллам вырос на 4\u00a0000: выдали больше, чем потратили — выкуп 60\u00a0%.',
  },
  {
    rule: 'Δдолга < 0',
    input: { ...MONTH, spent: 12_500, redemptionPercent: 125, debtPointsChange: -2_500 },
    expected: 'Долг по баллам снизился на 2\u00a0500: потратили больше, чем выдали.',
  },
  {
    rule: 'граница: |Δдолга| ровно 1 % выданного — уже «вырос»',
    input: { ...MONTH, spent: 9_900, redemptionPercent: 99, debtPointsChange: 100 },
    expected: 'Долг по баллам вырос на 100: выдали больше, чем потратили — выкуп 99\u00a0%.',
  },
  {
    rule: 'неполный месяц: «За 1 день месяца»',
    input: { ...MONTH, days: 1, partial: true },
    expected: 'За 1 день месяца долг по баллам вырос на 4\u00a0000: выдали больше, чем потратили — выкуп 60\u00a0%.',
  },
  {
    rule: 'неполный месяц: «За 21 день месяца»',
    input: { ...MONTH, spent: 12_500, redemptionPercent: 125, debtPointsChange: -2_500, days: 21, partial: true },
    expected: 'За 21 день месяца долг по баллам снизился на 2\u00a0500: потратили больше, чем выдали.',
  },

  // Вторая таблица — цена балла.
  {
    rule: 'заказов < 10',
    input: { ...MONTH, pointCostOrders: 9 },
    expected:
      'Долг по баллам вырос на 4\u00a0000: выдали больше, чем потратили — выкуп 60\u00a0%. Цене балла пока рано верить: посчитана по 9 заказам.',
  },
  {
    rule: 'заказов < 10, слово склоняется — «по 1 заказу»',
    input: { ...MONTH, pointCostOrders: 1 },
    expected:
      'Долг по баллам вырос на 4\u00a0000: выдали больше, чем потратили — выкуп 60\u00a0%. Цене балла пока рано верить: посчитана по 1 заказу.',
  },
  {
    rule: 'граница: ровно 10 заказов — второго предложения нет',
    input: { ...MONTH, pointCostOrders: 10 },
    expected: 'Долг по баллам вырос на 4\u00a0000: выдали больше, чем потратили — выкуп 60\u00a0%.',
  },
  {
    rule: '0 заказов — второго предложения нет',
    input: { ...MONTH, pointCostOrders: 0 },
    expected: 'Долг по баллам вырос на 4\u00a0000: выдали больше, чем потратили — выкуп 60\u00a0%.',
  },

  // Выдано ≤ 0 при потраченном не ноль — первого предложения нет.
  {
    rule: 'выдано = 0, потрачено не ноль — только цена балла',
    input: { ...MONTH, issued: 0, spent: 300, redemptionPercent: null, debtPointsChange: -300, pointCostOrders: 3 },
    expected: 'Цене балла пока рано верить: посчитана по 3 заказам.',
  },
  {
    rule: 'вывода нет: выдано < 0, потрачено не ноль, заказов достаточно',
    input: { ...MONTH, issued: -50, spent: 300, redemptionPercent: null, debtPointsChange: 0, pointCostOrders: 40 },
    expected: null,
  },
];

/** Закрытый полный месяц, 1 000 водителей на линии в прошлом: 1 водитель — 0,1 %. */
const FLOW: DriverFlowConclusionInput = {
  newDrivers: 50,
  returned: 20,
  left: 30,
  previousOnLine: 1_000,
  incomplete: false,
};

export const DRIVER_FLOW_CASES: readonly ConclusionCase<DriverFlowConclusionInput>[] = [
  // Примеры документа и макетов — отдельными случаями, текст до символа.
  {
    rule: 'пример на цифрах эталона: 38 / 27 / 47',
    input: { ...FLOW, newDrivers: 38, returned: 27, left: 47, previousOnLine: 413 },
    expected:
      'На линии на 18 водителей больше: пришло 65, ушло 47. Новых меньше, чем ушедших: убыль закрыли вернувшиеся — 27.',
  },
  {
    rule: 'пример декабря 2025: 70 / 25 / 106 при D₀ = 806',
    input: { newDrivers: 70, returned: 25, left: 106, previousOnLine: 806, incomplete: false },
    expected: 'Водителей на линии почти столько же: пришло 95, ушло 106.',
  },

  // Первая таблица — итог.
  {
    rule: '|Δ| < 2 % от D₀',
    input: { ...FLOW, newDrivers: 30, returned: 10, left: 50 },
    expected: 'Водителей на линии почти столько же: пришло 40, ушло 50.',
  },
  {
    rule: 'Δ > 0',
    input: FLOW,
    expected: 'На линии на 40 водителей больше: пришло 70, ушло 30. Одни новые перекрывают ушедших: 50 против 30.',
  },
  {
    rule: 'Δ < 0',
    input: { ...FLOW, newDrivers: 10, returned: 10, left: 60 },
    expected: 'На линии на 40 водителей меньше: ушло 60, пришло 20.',
  },

  // Вторая таблица — за счёт кого.
  {
    rule: 'N ≥ L',
    input: { ...FLOW, newDrivers: 45, returned: 5, left: 10 },
    expected: 'На линии на 40 водителей больше: пришло 50, ушло 10. Одни новые перекрывают ушедших: 45 против 10.',
  },
  {
    rule: 'N < L ≤ N + R',
    input: { ...FLOW, newDrivers: 20, returned: 40, left: 30 },
    expected:
      'На линии на 30 водителей больше: пришло 60, ушло 30. Новых меньше, чем ушедших: убыль закрыли вернувшиеся — 40.',
  },
  {
    rule: 'N + R < L — второго предложения нет',
    input: { ...FLOW, newDrivers: 20, returned: 10, left: 70 },
    expected: 'На линии на 40 водителей меньше: ушло 70, пришло 30.',
  },
  {
    rule: '«почти столько же» со вторым предложением',
    input: { ...FLOW, newDrivers: 20, returned: 25, left: 40 },
    expected:
      'Водителей на линии почти столько же: пришло 45, ушло 40. Новых меньше, чем ушедших: убыль закрыли вернувшиеся — 25.',
  },

  // Вывода нет. Панели нет (октябрь 2025) — функция не зовётся: `tests/integration/metrics/driverFlow.test.ts`.
  {
    rule: 'вывода нет: у месяца или у прошлого собраны не все сутки',
    input: { ...FLOW, incomplete: true },
    expected: null,
  },

  // Границы.
  {
    rule: 'граница: |Δ| ровно 2 % от D₀ — уже «больше»',
    input: { ...FLOW, newDrivers: 50, returned: 10, left: 40 },
    expected: 'На линии на 20 водителей больше: пришло 60, ушло 40. Одни новые перекрывают ушедших: 50 против 40.',
  },
  {
    rule: 'граница: |Δ| ровно 2 % от D₀ — уже «меньше»',
    input: { ...FLOW, newDrivers: 10, returned: 20, left: 50 },
    expected: 'На линии на 20 водителей меньше: ушло 50, пришло 30.',
  },
  {
    rule: 'граница: L = N + R — убыль закрыли вернувшиеся',
    input: { ...FLOW, newDrivers: 20, returned: 30, left: 50 },
    expected:
      'Водителей на линии почти столько же: пришло 50, ушло 50. Новых меньше, чем ушедших: убыль закрыли вернувшиеся — 30.',
  },
  {
    rule: 'граница: N = L — одни новые перекрывают',
    input: { ...FLOW, newDrivers: 40, returned: 10, left: 40, previousOnLine: 200 },
    expected: 'На линии на 10 водителей больше: пришло 50, ушло 40. Одни новые перекрывают ушедших: 40 против 40.',
  },
  {
    rule: 'граница: D₀ = 0 — порог не применяется, фраза по знаку Δ',
    input: { ...FLOW, newDrivers: 3, returned: 0, left: 0, previousOnLine: 0 },
    expected: 'На линии на 3 водителей больше: пришло 3, ушло 0. Одни новые перекрывают ушедших: 3 против 0.',
  },
  {
    rule: 'граница: D₀ = 0 и Δ = 0 — знака нет, «почти столько же»',
    input: { ...FLOW, newDrivers: 0, returned: 0, left: 0, previousOnLine: 0 },
    expected: 'Водителей на линии почти столько же: пришло 0, ушло 0. Одни новые перекрывают ушедших: 0 против 0.',
  },
  {
    rule: 'склонение: «на 1 водителя»',
    input: { ...FLOW, newDrivers: 2, returned: 1, left: 2, previousOnLine: 10 },
    expected: 'На линии на 1 водителя больше: пришло 3, ушло 2. Одни новые перекрывают ушедших: 2 против 2.',
  },
  {
    rule: 'склонение: «на 21 водителя»',
    input: { ...FLOW, newDrivers: 30, returned: 11, left: 20, previousOnLine: 500 },
    expected: 'На линии на 21 водителя больше: пришло 41, ушло 20. Одни новые перекрывают ушедших: 30 против 20.',
  },
  {
    rule: 'склонение: «на 11 водителей»',
    input: { ...FLOW, newDrivers: 5, returned: 5, left: 21, previousOnLine: 100 },
    expected: 'На линии на 11 водителей меньше: ушло 21, пришло 10.',
  },
  {
    rule: 'разряды — неразрывным пробелом',
    input: { ...FLOW, newDrivers: 900, returned: 400, left: 1_050, previousOnLine: 10_000 },
    expected:
      'На линии на 250 водителей больше: пришло 1\u00a0300, ушло 1\u00a0050. Новых меньше, чем ушедших: убыль закрыли вернувшиеся — 400.',
  },
];
