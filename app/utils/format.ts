/**
 * Форматирование чисел и времени для служебных экранов.
 *
 * Русский язык и местная зона — без обвязки локализации: водительские интерфейсы
 * многоязычны, но они придут своим этапом, и заводить обвязку заранее нечему.
 */

/** Прочерк вместо пустого места: «ничего нет» и «поле не нарисовалось» обязаны различаться. */
export const DASH = '—';

export const formatNumber = (value: number): string => value.toLocaleString('ru-RU');

export const formatDateTime = (value: string | null): string => {
  if (!value) {
    return DASH;
  }

  return new Date(value).toLocaleString('ru-RU', {
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
