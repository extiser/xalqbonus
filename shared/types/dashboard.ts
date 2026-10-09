/**
 * Ответы ручек дашборда метрик (issues #371, #373, #392, #402, #407, #438, #442). Определения метрик — `shared/metrics.ts`.
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
  /** Новички: сколько остаётся, первые 14 дней и список (issue #407). */
  newcomers: DashboardNewcomers;
  /** Цена водителя за год (issue #442). */
  driverValue: DashboardDriverValue;
  /** Можно вернуть — пул возврата (issue #446). */
  winback: DashboardWinbackPool;
};

/** Полоса давности последней поездки: 1–3, 3–6, 6–12 месяцев и больше года. */
export type DashboardWinbackBandKey = 'months1to3' | 'months3to6' | 'months6to12' | 'overYear';

/** Полоса «Можно вернуть». `null` у значений — цифр нет. */
export type DashboardWinbackBand = {
  key: DashboardWinbackBandKey;
  /** Ушедших в полосе на день отсчёта. */
  people: number | null;
  /** Из них 100+ поездок с апреля 2024. */
  many: number | null;
  /**
   * Какая доля не ездивших столько же снова поехала за 30 суток, процентом, как на экране:
   * целым, ниже 1 % — до десятой. `null` — снимков нет или цифр нет.
   */
  selfReturnPercent: number | null;
};

/**
 * «Можно вернуть» на «Глубине» (issue #446): ушедшие по давности последней поездки на день
 * отсчёта и доля тех, кто возвращается сам (docs/decisions.md → «Пул возврата на дашборде»).
 */
export type DashboardWinbackPool = {
  /** День отсчёта: последний день месяца, у идущего — вчера. */
  asOfDay: string;
  /** Месяцы поездок от начала истории по день отсчёта; собраны не все сутки — цифр нет. */
  coverage: DashboardPeriod[];
  /** Когда кончился последний успешный пересчёт денег; `null` — ещё не считали, цифр нет. */
  computedAt: string | null;
  /** Ушли за последний год — полосы 1–3, 3–6 и 6–12 месяцев вместе. */
  leftYear: number | null;
  leftYearMany: number | null;
  /** Четыре полосы по порядку давности. */
  bands: DashboardWinbackBand[];
  /** Медиана поездок с апреля 2024 у полосы «Больше года». */
  overYearMedianRides: number | null;
};

/**
 * Лидер или остальные на линии в «Цене водителя за год»: среднее по людям-месяцам наборов.
 * `null` у значений — цифр нет: собраны не все сутки или в месяце плитки нет оплаты.
 */
export type DashboardDriverValueGroup = {
  /** Людей-месяцев в наборах «за год». */
  people: number | null;
  /** Доход парка за 12 месяцев после месяца набора, сум целым. */
  value12: number | null;
  /** За 24 месяца; `null` — наборов «за два года» ещё нет или цифр нет. */
  value24: number | null;
  /** Сколько из 100 ездят через 12 месяцев, целым. */
  ridingAfterYearPercent: number | null;
};

/** Новичок в «Цене водителя за год»: за 12 месяцев с месяца прихода, считая его. */
export type DashboardDriverValueNewcomer = {
  people: number | null;
  /** Среднее по всем пришедшим, сум целым. */
  value12: number | null;
  /** Медиана — обычный новичок, сум целым. */
  median12: number | null;
  ridingAfterYearPercent: number | null;
  /** Сколько из 100 хоть раз были лидером за первый год, целым. */
  becameLeaderPercent: number | null;
  /** Среднее месяцев до первого лидерства у доросших; `null` — доросших нет. */
  monthsToLeader: number | null;
};

/**
 * Плитка «Цена водителя за год» на «Глубине» (issue #442) — docs/decisions.md → «Цена водителя
 * на дашборде». Считается по нынешним ставкам месяца плитки из готовой таблицы.
 */
export type DashboardDriverValue = {
  /** Месяц плитки `YYYY-MM`: выбранный закрытый или, у идущего, прошлый. */
  month: string;
  /** Выбран идущий месяц — плитка показывает последний закрытый. */
  ongoing: boolean;
  /** Первый и последний набор «за год», `YYYY-MM`. */
  cohortsFrom: string;
  cohortsTo: string;
  /** Когда кончился последний успешный пересчёт денег; `null` — ещё не считали. */
  computedAt: string | null;
  /** Месяцы от первого набора по месяц плитки; собраны не все сутки — цифр нет. */
  coverage: DashboardPeriod[];
  /** Ставки месяца плитки — доли оплаты; `null` — цифр нет. */
  rates: { main: number | null; newcomer: number | null };
  leader: DashboardDriverValueGroup;
  others: DashboardDriverValueGroup;
  newcomer: DashboardDriverValueNewcomer;
};

/**
 * Пороги новичков — значения констант сервера (`server/services/metrics/constants.ts`):
 * экран подставляет их в подписи и подсказки, а не держит свою копию.
 */
export type DashboardNewcomersThresholds = {
  /** Окно первых дней, суток. */
  firstDays: number;
  /** Порог поездок за окно. */
  tripsTarget: number;
};

/** Точка кривой «+k»: сумма ездивших в «набор + k» и сумма размеров этих наборов. */
export type DashboardNewcomersCurvePoint = {
  offset: number;
  riding: number;
  newcomers: number;
};

/**
 * Плитка «Сколько остаётся» по месяцу кривой R. Главная цифра — новички R − 1, ездившие в R;
 * кривая — средняя взвешенно по наборам окна. Точки без единого набора нет.
 */
export type DashboardNewcomersRetention = {
  /** Новичков R − 1. */
  newcomers: number;
  /** Из них ездили в R. */
  riding: number;
  /** Точки «+1» … по порядку, только те, за которыми есть новички. */
  curve: DashboardNewcomersCurvePoint[];
  /** Месяц первого набора в окне кривой `YYYY-MM`. */
  curveFromMonth: string;
};

/** Плитка «Первые 14 дней» по месяцу M на опорный день. */
export type DashboardNewcomersFirstDays = {
  /** Новичков M к опорному дню. */
  newcomers: number;
  /** Окно прошло, поездок не меньше порога. */
  reached: number;
  /** Окно прошло, поездок меньше порога. */
  below: number;
  /** Окно ещё идёт. */
  running: number;
  /** Ни одно окно не прошло: последний день окна самого раннего новичка; иначе `null`. */
  firstResultsDay: string | null;
  /** M − 1 тем же расчётом на тот же день, только прошедшие окна; `null` — M − 1 раньше первого набора. */
  previous: { passed: number; reached: number } | null;
};

/** Строка списка: человек. Телефонов здесь нет — они только в выгрузке. */
export type DashboardNewcomerRow = {
  personId: string;
  callsign: string | null;
  /** Фамилия, имя, отчество через пробел, как в базе. */
  name: string | null;
  /** Привязка Telegram открыта сейчас. */
  inProgram: boolean;
  /** Сутки первой поездки. */
  firstTripDay: string;
  /** Поездок за окно первых дней. */
  windowTrips: number;
  /** Последние сутки с поездкой не позже опорного дня. */
  lastTripDay: string;
};

/**
 * Новички на «Глубине» (issue #407) за выбранный месяц M (docs/decisions.md → «Новички
 * на дашборде»). Элемент посчитан или «не считаем» — `DashboardLeadersPart`: собраны не все сутки
 * с начала истории, и тогда `coverage` — эти сутки по месяцам.
 */
export type DashboardNewcomers = {
  thresholds: DashboardNewcomersThresholds;
  /** Выбранный месяц идёт. */
  ongoing: boolean;
  /** Опорный день D: последний день закрытого M, вчера у идущего. */
  asOfDay: string;
  /** Месяц кривой R: закрытый M — он сам, идущий — M − 1. */
  curveMonth: string;
  /** Первый набор `YYYY-MM` — месяц после первого месяца истории. */
  firstCohortMonth: string;
  /** M — первый месяц истории: новичков нет, всех элементов ниже нет. */
  noNewcomers: boolean;
  /** `null` — новичков нет или R − 1 раньше первого набора. */
  retention: DashboardLeadersPart<DashboardNewcomersRetention> | null;
  firstDays: DashboardLeadersPart<DashboardNewcomersFirstDays> | null;
  /**
   * Новички M с прошедшим окном и поездками меньше порога, в порядке экрана; считается вместе
   * с «Первыми 14 днями». Пустой и при нуле новичков, и когда ни одно окно не прошло — какой
   * из случаев, говорит `firstDays`.
   */
  list: DashboardLeadersPart<{ rows: DashboardNewcomerRow[] }> | null;
};

/**
 * Тело «Сделать сегмент» у списков дашборда (issue #415) — `POST /api/dashboard/leaders/segment`
 * и `POST /api/dashboard/newcomers/segment`: выбранный на экране месяц `YYYY-MM`.
 */
export type DashboardSegmentRequestBody = {
  month: string;
};

/**
 * Значения «Денег» за период (issue #438): доход = заказы × оплата на заказ × комиссия парка,
 * ровно. В сутки (`perDay` у сравнения) доход, заказы и оплата делятся на сутки периода.
 */
export type DashboardMoneyValues = {
  /** Доход парка, сум целым: в сутки — доход ÷ суток, округлённый до сума. */
  income: number;
  /** Заказов; в сутки — дробное, как посчитано, округляет экран. */
  orders: number;
  /** Оплата на заказ, сум: оплата ÷ заказы. */
  paymentPerOrder: number;
  /** Комиссия парка — доля оплаты: доход ÷ оплата. */
  commission: number;
  /** Доход с заказа, сум: доход ÷ заказы. */
  incomePerOrder: number;
};

/** Сколько сумов дохода прибавил или отнял каждый множитель. Целые, в сумме ровно `total`. */
export type DashboardMoneyContributions = {
  orders: number;
  paymentPerOrder: number;
  commission: number;
  total: number;
};

/** «Почему изменилось» к одной базе: тот же месяц год назад или прошлый месяц. */
export type DashboardMoneyComparison = {
  basePeriod: DashboardPeriod;
  /** Сравнение в сутки: к прошлому месяцу всегда, к году — когда у периода и базы суток разное число. */
  perDay: boolean;
  current: DashboardMoneyValues;
  /** `null` — в базе нет ни одного заказа: сравнивать не с чем. */
  base: DashboardMoneyValues | null;
  /** `null` — разложения нет: базы нет или в периоде либо базе дохода ноль. */
  contributions: DashboardMoneyContributions | null;
  /** Вывод словами под уравнением; `null` — вывода нет. */
  conclusion: string | null;
};

/** Столбец «Доход парка по месяцам». */
export type DashboardMoneyMonth = {
  /** `YYYY-MM`. */
  month: string;
  /** Доход за посчитанные сутки, сум целым. */
  income: number;
  /** Суток в столбце: у идущего месяца — посчитанные. */
  days: number;
  coveredDays: number;
  /** Идущий месяц: доход за посчитанные сутки. */
  partial: boolean;
};

/** Вкладка «Деньги» за месяц — `GET /api/dashboard/money?month=YYYY-MM`. */
export type DashboardMoney = {
  month: string;
  /** Месяцы, которые можно выбрать. */
  range: { firstMonth: string; lastMonth: string };
  /** Когда кончился последний успешный пересчёт денег; `null` — ещё не считали. */
  computedAt: string | null;
  /** Период месяца с покрытием; у идущего — посчитанные сутки, ноль — ещё ни одних. */
  period: DashboardPeriod;
  /** Доход периода, сум целым. */
  income: number;
  orders: number;
  /** Оплата периода, сум целым. */
  payment: number;
  /** Базы сравнения: тот же месяц год назад и прошлый месяц. */
  bases: { year: DashboardMoneyComparison; month: DashboardMoneyComparison };
  /** 13 месяцев, от месяца год назад по выбранный. */
  byMonth: DashboardMoneyMonth[];
};
