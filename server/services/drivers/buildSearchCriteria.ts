import type { DriverSearchCriteria } from '#server/repositories/drivers';
import { normalizeLicenseNumber } from '#server/utils/licenseNumber';

/**
 * Разбор строки поиска на три признака: номер ВУ, телефон и имя.
 *
 * Поле ввода одно, а признака три, и выбирать между ними должен не оператор. Он не знает
 * заранее, что ему сейчас продиктуют — номер, телефон или фамилию, а на каждом водителе
 * этот выбор стоит времени.
 *
 * Логика живёт в сервисе, а не в обработчике и не в компоненте: «что считается номером»
 * и «сколько цифр достаточно для поиска телефона» — вопросы предметной области,
 * а не разбора HTTP-запроса.
 */

/**
 * Меньше цифр искать бессмысленно: по трём цифрам совпадёт половина парка, и список
 * перестанет быть ответом.
 */
const MIN_PHONE_DIGITS = 5;

/** Слово короче двух букв признаком имени не является. */
const MIN_NAME_TERM_LENGTH = 2;

const LETTER = /\p{L}/u;
const DIGIT = /[0-9]/;

/**
 * Экранирование спецсимволов `LIKE`.
 *
 * Без него запрос из одного знака `%` совпадает со всем реестром сразу: `%` и `_`
 * в шаблоне — не буквы, а подстановка. Обратный слэш экранируется первым, иначе
 * экранирование само себя и портит.
 */
const escapeLikePattern = (term: string): string =>
  term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');

/**
 * Номер ВУ из запроса — нормализованным значением.
 *
 * Ищем по `number_canonical`, потому что водитель диктует номер как попало: в реестре один
 * и тот же номер лежит в двух написаниях — с префиксом `UZ` (21 634 профиля) и без него
 * (3 756), встречается кириллица, разделители и нижний регистр. Ровно для этого поле
 * и заведено (docs/drivers.md).
 *
 * Признаком номера считается наличие и буквы, и цифры: чистые цифры — это телефон,
 * чистые буквы — имя, и гонять по ним поиск номера незачем.
 */
const readLicenseCanonical = (query: string): string | null => {
  const canonical = normalizeLicenseNumber(query);

  if (!LETTER.test(canonical) || !DIGIT.test(canonical)) {
    return null;
  }

  return canonical;
};

/**
 * Цифры телефона. Код страны не снимается: совпадение идёт по хвосту номера.
 *
 * Запрос с буквой телефоном не считается: в телефоне букв не бывает, а номер ВУ —
 * это буквы с цифрами, и без этого правила поиск по номеру `AD368263` тащил бы за собой
 * всех, чей телефон кончается на `368263`.
 */
const readPhoneDigits = (query: string): string | null => {
  if (LETTER.test(query)) {
    return null;
  }

  const digits = query.replace(/[^0-9]/g, '');

  return digits.length >= MIN_PHONE_DIGITS ? digits : null;
};

/**
 * Слова имени. Запрос с цифрой именем не является целиком — ни одним своим словом.
 *
 * Отбрасывается весь запрос, а не отдельные слова с цифрами: в номере `uz af-0415107`
 * словом без цифр остаётся `uz`, и поиск по имени притащил бы всех Музаффаров и Фирузов
 * парка, утопив в них того единственного, кого искали. В именах цифр не бывает, значит
 * запрос с цифрой — это номер или телефон, и по имени в нём искать нечего.
 */
const readNameTerms = (query: string): string[] => {
  if (DIGIT.test(query)) {
    return [];
  }

  return query
    .split(/\s+/)
    .filter((term) => term.length >= MIN_NAME_TERM_LENGTH)
    .map(escapeLikePattern);
};

export const buildSearchCriteria = (query: string): DriverSearchCriteria => {
  const trimmed = query.trim();

  if (trimmed.length === 0) {
    return { licenseCanonical: null, phoneDigits: null, nameTerms: [] };
  }

  return {
    licenseCanonical: readLicenseCanonical(trimmed),
    phoneDigits: readPhoneDigits(trimmed),
    nameTerms: readNameTerms(trimmed),
  };
};

/** Есть ли по чему искать. Пустые критерии не запрос, а пустое поле ввода. */
export const hasSearchCriteria = (criteria: DriverSearchCriteria): boolean =>
  criteria.licenseCanonical !== null ||
  criteria.phoneDigits !== null ||
  criteria.nameTerms.length > 0;
