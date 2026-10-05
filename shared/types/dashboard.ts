/**
 * Ответы ручек дашборда метрик (issues #371, #373, #392, #402). Определения метрик — `shared/metrics.ts`.
 *
 * Даты — строки `YYYY-MM-DD`, месяцы — `YYYY-MM`: сутки и месяц метрик календарные
 * по Ташкенту, и зона показа сдвигать их не должна.
 */

/** Период сравнения: сутки `from`–`to` включительно. */
export type DashboardPeriod = {
  from: string;
  to: string;
  /** Сколько суток в периоде. */
  days: number;
  /** Сколько из них собрано полностью; меньше `days` — цифры занижены. */
  coveredDays: number;
  /** Период короче своего месяца: текущий месяц по вчера или столько же первых суток прошлого. */
  partial: boolean;
};

/**
 * Множители поездок: `trips = driversOnLine × daysOnLine × tripsPerDay`. Дни на линии
 * и поездки в день — дробные, как посчитаны; округляет экран.
 */
export type DashboardMultipliers = {
  trips: number;
  driversOnLine: number;
  daysOnLine: number;
  tripsPerDay: number;
};

/**
 * Сколько поездок прибавил или отнял каждый множитель. Целые, в сумме ровно `total` —
 * изменение поездок к базе.
 */
export type DashboardContributions = {
  driversOnLine: number;
  daysOnLine: number;
  tripsPerDay: number;
  total: number;
};

/** Вкладка «Рычаги» за месяц — `GET /api/dashboard/levers?month=YYYY-MM`. */
export type DashboardLevers = {
  month: string;
  /** Месяцы, которые можно выбрать. */
  range: { firstMonth: string; lastMonth: string };
  period: DashboardPeriod;
  basePeriod: DashboardPeriod;
  current: DashboardMultipliers;
  /** `null` — в базовом периоде поездок нет, сравнивать не с чем. */
  base: DashboardMultipliers | null;
  /** `null` — поездок нет в одном из периодов: разложения нет. */
  contributions: DashboardContributions | null;
  /** Когда кончился последний успешный пересчёт; `null` — ещё не считали. */
  computedAt: string | null;
  /** Вывод словами под множителями (issue #383); `null` — вывода нет. */
  conclusion: string | null;
  /** Поток водителей по месяцам и панель месяца (issue #392). */
  flow: DashboardDriverFlow;
  /** Лидеры по поездкам и список тех, кого парк может потерять (issue #402). */
  leaders: DashboardLeaders;
};

/**
 * Пороги блока лидеров — значения констант сервера (`server/services/metrics/constants.ts`):
 * экран подставляет их в подписи и подсказки, а не держит свою копию.
 */
export type DashboardLeadersThresholds = {
  /** Лидеры — верхние N % водителей на линии. */
  leadersPercent: number;
  /** Окно нормы, недель. */
  normWeeks: number;
  /** Неделя ниже нормы — на N % и больше. */
  belowNormPercent: number;
  /** В список — с N недель подряд ниже нормы. */
  streakMinWeeks: number;
};

/**
 * Элемент блока лидеров: посчитан или «не считаем» — собраны не все нужные сутки. Тогда данных
 * нет, а `coverage` — нужные сутки по месяцам и сколько из них собрано.
 */
export type DashboardLeadersPart<T> =
  | ({ counted: true } & T)
  | { counted: false; coverage: DashboardPeriod[] };

export type DashboardLeaderGroup = 'below' | 'stopped' | 'left';

/** Строка списка: человек. Телефонов здесь нет — они только в выгрузке. */
export type DashboardLeaderRow = {
  personId: string;
  group: DashboardLeaderGroup;
  callsign: string | null;
  /** Фамилия, имя, отчество через пробел, как в базе. */
  name: string | null;
  /** Привязка Telegram открыта сейчас. */
  inProgram: boolean;
  /** Поездок за последнюю полную неделю. */
  weekTrips: number;
  /** Норма целым; у ушедших — до остановки; `null` — нормы нет. */
  norm: number | null;
  /** Поездки недели к норме − 1, целым процентом; только у «ездят меньше». */
  deviationPercent: number | null;
  /** Сколько суток не ездит к опорному дню; у «перестали» и «ушли». */
  idleDays: number | null;
  /** Недель подряд ниже нормы; у ушедших — `null`. */
  weeksBelow: number | null;
  /** Последние сутки с поездкой не позже опорного дня. */
  lastTripDay: string;
};

/**
 * Блок лидеров на «Рычагах» (issue #402) за выбранный месяц M. Лидеры — месяца M−1, их состояние —
 * по последней полной неделе на опорный день; «ушли» — лидеры месяца `cohortMonth` без поездок
 * в следующем за ним (docs/decisions.md → «Лидеры по поездкам и список тех, кого парк может
 * потерять»).
 */
export type DashboardLeaders = {
  thresholds: DashboardLeadersThresholds;
  /** Месяц лидеров `YYYY-MM` — M−1. */
  leadersMonth: string;
  /** Месяц лидеров когорты «ушли»: M−1 у закрытого M, M−2 у идущего. */
  cohortMonth: string;
  /** Выбранный месяц идёт. */
  ongoing: boolean;
  /** Опорный день: последний день закрытого M, вчера у идущего. */
  asOfDay: string;
  /** Последняя полная неделя пн–вс, кончающаяся не позже опорного дня. */
  week: { from: string; to: string };
  /** Месяц лидеров раньше истории заказов (выбран октябрь 2025): лидеров нет, частей ниже нет. */
  noLeaders: boolean;
  leaders: DashboardLeadersPart<{
    leaders: number;
    driversOnLine: number;
    leaderTrips: number;
    allTrips: number;
  }> | null;
  slipping: DashboardLeadersPart<{ below: number; stopped: number }> | null;
  left: DashboardLeadersPart<{
    left: number;
    /** Лидеров месяца когорты. */
    leaders: number;
    /** Поездки ушедших за месяц когорты. */
    trips: number;
  }> | null;
  /** Строки трёх групп в порядке экрана; `counted: false` — список не строится. */
  list: DashboardLeadersPart<{ rows: DashboardLeaderRow[] }> | null;
};

/**
 * Поток водителей за закрытый месяц (issue #392): на линии(M) − на линии(M−1) =
 * новые + вернулись − ушли. Определения — `shared/metrics.ts`.
 */
export type DashboardFlowMonth = {
  /** `YYYY-MM`. */
  month: string;
  onLine: number;
  newDrivers: number;
  returned: number;
  left: number;
  onLineChange: number;
  /** Месяц раньше FLOW_NEW_EXACT_FROM: часть вернувшихся посчитана как новые. */
  earlyHistory: boolean;
  /** Собраны не все сутки у месяца или у прошлого. */
  incomplete: boolean;
  /** Периоды M−1 и M с покрытием — те, по которым считается incomplete; из них экран собирает строку покрытия. */
  coverage: DashboardPeriod[];
};

export type DashboardDriverFlow = {
  /** До 6 закрытых месяцев от старых к новым, последний — выбранный или последний закрытый; не раньше ноября 2025. */
  months: DashboardFlowMonth[];
  /** Месяц панели: выбранный, если закрыт; если идёт — последний закрытый; null — выбран октябрь 2025. */
  panel: DashboardFlowMonth | null;
  /** Выбранный месяц ещё идёт. */
  selectedOngoing: boolean;
  /** Выбран первый месяц истории (октябрь 2025): водителей на линии в нём — для строки «На линии». */
  firstMonthOnLine: number | null;
  /** Вывод словами о месяце панели (issue #398); `null` — вывода нет. */
  conclusion: string | null;
};

/**
 * Неделя графика «Баллы по неделям» (issue #373): с понедельника по воскресенье по Ташкенту.
 * Выдано может быть меньше нуля — ручные списания вычитаются из выдачи.
 */
export type DashboardPointsWeek = {
  /** Понедельник недели, `YYYY-MM-DD`. */
  weekStart: string;
  issued: number;
  spent: number;
  /** Неделя ещё идёт: её числа вырастут. */
  current: boolean;
};

/** Плитка «Экономика программы» за месяц. Определения — `shared/metrics.ts`. */
export type DashboardProgramEconomy = {
  issued: number;
  spent: number;
  /** Потрачено ÷ выдано, процентом до целого; `null` — ничего не выдано. */
  redemptionPercent: number | null;
  /** Сум за балл на конец периода, за всё время программы; `null` — выданных заказов нет. */
  pointCost: number | null;
  /** Выданных заказов, по которым посчитана цена балла. */
  pointCostOrders: number;
  /** Строк выданных заказов без себестоимости — в цену не вошли. */
  pointCostUnpricedLines: number;
  /** Сумма плюсовых балансов на конец периода. */
  debtPoints: number;
  /** Долг на конец периода минус долг на начало. */
  debtPointsChange: number;
  /** Долг × цена балла; `null` — цены нет. */
  debtSum: number | null;
  /** Вывод словами под плиткой (issue #383); `null` — вывода нет. */
  conclusion: string | null;
};

/** Плитка «Вне программы» за месяц: водители на линии без единой привязки Telegram. */
export type DashboardOutsideProgram = {
  drivers: number;
  driversOnLine: number;
  /** Их поездки за период. */
  trips: number;
  /** Все поездки периода. */
  allTrips: number;
};

/** Вкладка «Глубина» за месяц — `GET /api/dashboard/depth?month=YYYY-MM`. */
export type DashboardDepth = {
  month: string;
  /** Месяцы, которые можно выбрать. */
  range: { firstMonth: string; lastMonth: string };
  period: DashboardPeriod;
  /** До 12 недель, последняя — та, в которую входит конец периода. */
  weeks: DashboardPointsWeek[];
  economy: DashboardProgramEconomy;
  outside: DashboardOutsideProgram;
};
