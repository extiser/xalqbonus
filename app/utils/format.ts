/**
 * Форматирование чисел и времени для служебных экранов.
 *
 * Русский язык без обвязки локализации: водительские интерфейсы многоязычны, но они придут
 * своим этапом, и заводить обвязку заранее нечему.
 */

/** Прочерк вместо пустого места: «ничего нет» и «поле не нарисовалось» обязаны различаться. */
export const DASH = '—';

/**
 * Зона, в которой показывается всё время на экране.
 *
 * Задана явно, а не взята у машины. Без неё серверный кадр рисуется в зоне контейнера
 * (UTC), а кадр после гидратации — в зоне браузера, и один и тот же момент показывается
 * двумя разными временами, отличающимися на пять часов и иногда на дату. Заметить это
 * можно только по мельканию при загрузке — то есть почти никогда, а верить экрану после
 * такого нельзя.
 *
 * Зона парка, а не зона смотрящего: числа на экране сверяются с рабочим днём в Ташкенте,
 * и стенд, поднятый на машине в другой зоне, обязан показывать то же самое.
 */
export const DISPLAY_TIME_ZONE = 'Asia/Tashkent';

/**
 * Подпись зоны — «Asia/Tashkent (UTC+5)».
 *
 * Смещение считается от постоянной точки во времени, а не от «сейчас»: в зоне без перевода
 * часов результат тот же, а вычисление, зависящее от момента, однажды дало бы серверу
 * и браузеру разные подписи — ровно ту ошибку, ради которой зона и задана явно.
 */
const TIME_ZONE_REFERENCE = new Date('2026-01-01T00:00:00Z');

/**
 * Смещение зоны видом «UTC+5».
 *
 * Берётся `longOffset` — он определён как «GMT+05:00» и записывается одинаково любым
 * движком; `shortOffset` допускает и «GMT+5», и «GMT+05», и разночтение сервера с браузером
 * дало бы расхождение кадров на той самой подписи, которая от него и страхует.
 */
const readZoneOffset = (): string | null => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DISPLAY_TIME_ZONE,
    timeZoneName: 'longOffset',
  }).formatToParts(TIME_ZONE_REFERENCE);

  const offset = parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
  const parsed = /^GMT([+-])(\d{2}):(\d{2})$/.exec(offset);

  if (!parsed) {
    return null;
  }

  const [, sign, hours, minutes] = parsed;
  const wholeHours = Number(hours);

  return minutes === '00'
    ? `UTC${sign}${wholeHours}`
    : `UTC${sign}${wholeHours}:${minutes}`;
};

const zoneOffset = readZoneOffset();

export const DISPLAY_TIME_ZONE_LABEL = zoneOffset
  ? `${DISPLAY_TIME_ZONE} (${zoneOffset})`
  : DISPLAY_TIME_ZONE;

export const formatNumber = (value: number): string => value.toLocaleString('ru-RU');

export const formatDateTime = (value: string | null): string => {
  if (!value) {
    return DASH;
  }

  return new Date(value).toLocaleString('ru-RU', {
    timeZone: DISPLAY_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export const formatDate = (value: string | null): string => {
  if (!value) {
    return DASH;
  }

  return new Date(value).toLocaleString('ru-RU', {
    timeZone: DISPLAY_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Длительность словами: «3 с», «4 мин 12 с», «2 ч 30 мин».
 *
 * Секунды у часов не показываются намеренно — у прогона длиной в час они не значат ничего,
 * а строку удлиняют.
 */
export const formatDuration = (milliseconds: number | null): string => {
  if (milliseconds === null) {
    return DASH;
  }

  const totalSeconds = Math.max(Math.round(milliseconds / 1_000), 0);

  if (totalSeconds < 60) {
    return `${totalSeconds} с`;
  }

  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (totalMinutes < 60) {
    return `${totalMinutes} мин ${seconds} с`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours < 24) {
    return `${hours} ч ${minutes} мин`;
  }

  return `${Math.floor(hours / 24)} д ${hours % 24} ч`;
};

/** Окно опроса одной строкой. У полного обхода реестра окна нет вовсе — там прочерк. */
export const formatWindow = (from: string | null, to: string | null): string => {
  if (!from && !to) {
    return DASH;
  }

  return `${formatDate(from)} → ${formatDate(to)}`;
};
