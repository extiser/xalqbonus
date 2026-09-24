/**
 * Время, каким его видит водитель, — в зоне парка.
 *
 * Зона задана явно, а не взята у машины. Контейнер живёт в UTC, и без явной зоны поездка,
 * завершённая в половине третьего ночи по Ташкенту, показалась бы вчерашней, а разделитель
 * дня встал бы не там, где у водителя кончился рабочий день. Спор у стойки в офисе идёт
 * про часы ташкентского дня, и других часов на этом экране быть не должно.
 *
 * Зона парка, а не зона телефона: то же решение и по той же причине, что на служебных
 * экранах (`app/utils/format.ts`), — но своё, потому что форматирует здесь сервер,
 * а серверному коду до `app/` доступа нет.
 */

export const PARK_TIME_ZONE = 'Asia/Tashkent';

/**
 * Час, с которого начинаются сутки парка (docs/decisions.md → «Сутки — с 05:00 до 05:00
 * по Ташкенту, одни на всё приложение»): смена, кончающаяся в три ночи, для водителя вчерашняя.
 *
 * По нему режет сутки сырой SQL (`parkDaySql.ts`) — давность поездки у сегментов и окна акций. `formatDayKey`
 * ниже пока режет календарные сутки — его перевод на 05:00 идёт своей задачей (T40), это правка
 * работающего поведения.
 */
export const PARK_DAY_START_HOUR = 5;

/**
 * Время суток вида `14:32`.
 *
 * Круглосуточное намеренно: `ru-RU` и без того даёт 24 часа, но на явной локали это
 * не зависит от того, какие локали собраны в образе.
 */
const CLOCK = new Intl.DateTimeFormat('ru-RU', {
  timeZone: PARK_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Календарная дата вида `12.09.2026`. Цифрами, поэтому одинаково читается на обоих языках. */
const CALENDAR_DATE = new Intl.DateTimeFormat('ru-RU', {
  timeZone: PARK_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/**
 * День и месяц вида `23.09` — срок висящего заказа: он живёт сутки, и год при нём лишний.
 */
const DAY_MONTH = new Intl.DateTimeFormat('ru-RU', {
  timeZone: PARK_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
});

/**
 * День вида `2026-09-12` — ключ, по которому строки истории собираются в группы.
 *
 * `en-CA` даёт ISO-порядок готовым; собирать его из частей вручную значит писать то же
 * самое на десять строк длиннее.
 */
const DAY_KEY = new Intl.DateTimeFormat('en-CA', {
  timeZone: PARK_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export const formatClockTime = (moment: Date): string => CLOCK.format(moment);

export const formatCalendarDate = (moment: Date): string => CALENDAR_DATE.format(moment);

export const formatDayMonth = (moment: Date): string => DAY_MONTH.format(moment);

export const formatDayKey = (moment: Date): string => DAY_KEY.format(moment);

/** Сколько миллисекунд в сутках. Перевода часов в Узбекистане нет — сутки ровно такие. */
export const DAY_MS = 24 * 60 * 60 * 1_000;

/** День перед этим — в зоне парка. Нужен, чтобы подписать вчерашние строки словом. */
export const previousDayKey = (moment: Date): string =>
  formatDayKey(new Date(moment.getTime() - DAY_MS));
