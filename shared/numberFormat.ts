/**
 * Вид чисел — один на сервере и на экране (issue #383): выводы словами под плитками дашборда
 * собирает сервер, и число во фразе обязано выглядеть так же, как то же число на плитке.
 * Экран берёт эти функции через `app/utils/format.ts`.
 *
 * Разряды — неразрывным пробелом, как их ставит `ru-RU`: «3 720» не рвётся переносом строки.
 */

/** Неразрывный пробел — между числом и «%», как между разрядами. */
const NO_BREAK_SPACE = '\u00a0';

/** Типографский минус: у дефиса другая ширина, и колонка чисел с ним разъезжается. */
const MINUS = '−';

/**
 * Число с разрядами: «1 844». Отрицательное — с типографским минусом, «−1 844», как
 * у `formatSignedNumber`: баланс водителя бывает долгом из старой базы (issue #276),
 * а дефис движка у разных локалей разный и в колонке чисел разъезжается.
 */
export const formatNumber = (value: number): string =>
  value < 0 ? `${MINUS}${Math.abs(value).toLocaleString('ru-RU')}` : value.toLocaleString('ru-RU');

/**
 * Баллы со знаком: «+1», «−2 342».
 *
 * Знак обязателен у обоих направлений: в двусторонней записи «1» без знака не отвечает
 * на вопрос, пришёл балл или ушёл. Минус — типографский, а не дефис: у дефиса другая
 * ширина, и колонка чисел с ним разъезжается.
 */
export const formatSignedNumber = (value: number): string =>
  value < 0 ? formatNumber(value) : `+${formatNumber(value)}`;

/**
 * Число до десятой, всегда с ней: «17,4», «11,0» — множитель дашборда (issue #371). Десятая
 * не пропадает у круглого числа: в ряду множителей «17» рядом с «17,1» читалось бы иначе.
 */
export const formatTenths = (value: number): string =>
  value.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Процент до десятой со знаком: «+4,7 %», «−2,0 %». Минус — типографский. */
export const formatSignedPercent = (value: number): string =>
  `${value < 0 ? MINUS : '+'}${formatTenths(Math.abs(value))}${NO_BREAK_SPACE}%`;

/** Процент целым: «20 %», «−5 %» — выкуп, как его считает сервер. */
export const formatWholePercent = (value: number): string => `${formatNumber(value)}${NO_BREAK_SPACE}%`;

/**
 * Форма слова при числе: `pluralize(21, 'час', 'часа', 'часов')` — «час».
 *
 * Правило русского счёта: на 1 — первая форма, на 2–4 — вторая, остальное и 11–14 — третья.
 */
export const pluralize = (count: number, one: string, few: string, many: string): string => {
  const lastTwo = Math.abs(count) % 100;
  const last = lastTwo % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return many;
  }

  if (last === 1) {
    return one;
  }

  return last >= 2 && last <= 4 ? few : many;
};
