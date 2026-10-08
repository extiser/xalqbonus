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

const COMPACT_UNITS: readonly { size: number; unit: string }[] = [
  { size: 1_000_000_000, unit: 'млрд' },
  { size: 1_000_000, unit: 'млн' },
  { size: 1_000, unit: 'тыс.' },
];

/**
 * Сумма сокращённо (issue #373): до тысячи — целым, дальше «тыс.», «млн», «млрд» с одним знаком
 * после запятой — «1,8 млрд». Долг в сумах — оценка, и цифры за запятой у неё — шум.
 *
 * Разряд выбирается по уже округлённому числу: 999 960 — «1,0 млн», а не «1 000,0 тыс.».
 * Общая с сервером с вкладки «Деньги» (issue #438): суммы во выводе словами — как на плитке.
 */
export const formatCompactSum = (value: number): string => {
  const magnitude = Math.abs(value);

  if (magnitude < 1_000) {
    return formatNumber(Math.round(value));
  }

  for (const { size, unit } of COMPACT_UNITS) {
    if (Math.round((magnitude / size) * 10) >= 10) {
      return `${formatTenths(value / size)} ${unit}`;
    }
  }

  return formatNumber(Math.round(value));
};

/** Сумма сокращённо со знаком: «−58,2 млн», «+39,7 тыс.». Минус — типографский. */
export const formatSignedCompactSum = (value: number): string =>
  `${value < 0 ? MINUS : '+'}${formatCompactSum(Math.abs(value))}`;

/** Число с `digits` знаками после запятой, всегда с ними: «4,07», «4,608». */
export const formatDecimal = (value: number, digits: number): string =>
  value.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/**
 * Комиссия парка процентом у периода и базы (issue #438): до сотой, а если у обоих до сотой
 * она одна — до тысячной, иначе «4,61 против 4,61» не говорит, куда она сдвинулась.
 * Вход — доли оплаты, `0.0461`. Базы нет — у периода до сотой.
 */
export const formatCommissionPair = (
  current: number,
  base: number | null,
): { current: string; base: string | null } => {
  const hundredths = (value: number): string => formatDecimal(value * 100, 2);

  if (base === null) {
    return { current: hundredths(current), base: null };
  }

  const digits = hundredths(current) === hundredths(base) ? 3 : 2;

  return { current: formatDecimal(current * 100, digits), base: formatDecimal(base * 100, digits) };
};
