import type { LandingCheckKey } from './types/landings';

/**
 * Лендинги в «Промо» (issue #478): пределы архива, форматы картинок и подписи пунктов проверки.
 *
 * Лежат в `shared/`, потому что читают их обе стороны: окно загрузки проверяет размер архива
 * при выборе файла и подписывает пункты проверки, а сервер проверяет то же заново —
 * запрос приходит не только из этого окна (docs/decisions.md → «Лендинги в „Промо“»).
 *
 * Относительными путями, а не через `#shared`: так подключаются соседние файлы `shared/`.
 */

/** Потолок архива. Больше — лендинг не сохраняется вовсе, проверки нет. */
export const LANDING_MAX_ARCHIVE_BYTES = 5 * 1024 * 1024;

/** То же число мегабайтами — для подписи и текста отказа. */
export const LANDING_MAX_ARCHIVE_MB = LANDING_MAX_ARCHIVE_BYTES / (1024 * 1024);

/** Название лендинга — видно только сотрудникам, в списке и в выборе у метки. */
export const LANDING_NAME_MAX_LENGTH = 80;

/**
 * Какие картинки принимаются — по расширению файла в архиве — и с каким типом содержимого
 * их отдаёт приложение. Ключи — в нижнем регистре: `HERO.JPG` — та же картинка.
 */
export const LANDING_IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** Расширение пути в нижнем регистре; без точки — пустая строка. */
export const landingFileExtension = (path: string): string => {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');

  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
};

/** Тип содержимого картинки лендинга по пути. `null` — формат не из списка. */
export const landingImageContentType = (path: string): string | null =>
  LANDING_IMAGE_EXTENSIONS[landingFileExtension(path)] ?? null;

/**
 * Путь файла внутри архива — в том виде, в каком он ищется среди файлов архива и лежит на томе.
 *
 * `./` и пустые сегменты отбрасываются; `..`, обратная косая черта и путь от корня не принимаются
 * вовсе: такой файл не считается найденным и на том не ложится. `null` — путь не принят.
 */
export const normalizeLandingPath = (path: string): string | null => {
  if (path.startsWith('/') || path.includes('\\') || path.includes('\0')) return null;

  const segments: string[] = [];

  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') return null;
    segments.push(segment);
  }

  return segments.length > 0 ? segments.join('/') : null;
};

/** Пункты проверки в порядке окна загрузки. */
export const LANDING_CHECK_KEYS: readonly LandingCheckKey[] = ['index', 'name_field', 'submit_button', 'images'];

/** Подпись пункта — одна при галочке и при крестике: что не так, говорят строки причин под ней. */
export const LANDING_CHECK_LABELS: Readonly<Record<LandingCheckKey, string>> = {
  index: 'index.html в корне архива',
  name_field: 'Поле имени найдено',
  submit_button: 'Кнопка отправки найдена',
  images: 'Картинки на месте',
};

// ---------------------------------------------------------------------------
// Ссылки на картинки в разметке лендинга
// ---------------------------------------------------------------------------
//
// Ссылки ищет сервер — проверить, что картинка лежит в архиве, — и переписывает компонент
// лендинга — подставить адрес версии на томе. Разбор у них один: разошедшийся, он пропускал бы
// проверкой картинку, которую компонент потом не нашёл бы.

/** Адрес со схемой — `https:`, `data:`, `javascript:` — или без схемы, но на другой сервер: `//`. */
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

/** Какая ссылка: встроенная картинка, чужой адрес, ссылка внутри документа или файл архива. */
export type LandingReferenceKind = 'data' | 'external' | 'fragment' | 'relative';

export const classifyLandingReference = (reference: string): LandingReferenceKind => {
  if (/^data:/i.test(reference)) return 'data';
  if (reference.startsWith('//') || SCHEME_PATTERN.test(reference)) return 'external';
  // `url(#градиент)` в стилях — ссылка на элемент SVG в той же разметке, а не на файл.
  if (reference.startsWith('#')) return 'fragment';

  return 'relative';
};

/**
 * Ссылки `srcset`: кандидаты через запятую, у каждого адрес до пробела и описатель после.
 * Разбор — по правилам браузера, а не делением строки по запятым: у `data:` запятая внутри
 * адреса. `map` получает каждый адрес и возвращает, чем его заменить; остальное — как было.
 */
export const mapSrcset = (value: string, map: (url: string) => string): string => {
  let result = '';
  let position = 0;

  while (position < value.length) {
    const gapStart = position;

    while (position < value.length && /[\s,]/.test(value.charAt(position))) position += 1;

    result += value.slice(gapStart, position);

    if (position >= value.length) break;

    let urlEnd = position;

    while (urlEnd < value.length && !/\s/.test(value.charAt(urlEnd))) urlEnd += 1;

    const token = value.slice(position, urlEnd);
    const url = token.replace(/,+$/, '');

    result += map(url) + token.slice(url.length);
    position = urlEnd;

    // Запятые в конце адреса закрыли кандидата — описателя у него нет.
    if (url !== token) continue;

    const descriptorStart = position;
    let depth = 0;

    while (position < value.length) {
      const character = value.charAt(position);

      if (character === '(') depth += 1;
      else if (character === ')') depth = Math.max(0, depth - 1);
      else if (character === ',' && depth === 0) break;

      position += 1;
    }

    result += value.slice(descriptorStart, position);
  }

  return result;
};

const CSS_URL_PATTERN = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s'"]*))\s*\)/gi;

/** Ссылки `url(...)` в тексте стилей. `map` — как у `mapSrcset`; кавычки остаются прежними. */
export const mapCssUrls = (text: string, map: (url: string) => string): string =>
  text.replace(CSS_URL_PATTERN, (match: string, doubleQuoted?: string, singleQuoted?: string, bare?: string) => {
    if (doubleQuoted !== undefined) return `url("${map(doubleQuoted)}")`;
    if (singleQuoted !== undefined) return `url('${map(singleQuoted)}')`;
    if (bare !== undefined && bare !== '') return `url(${map(bare)})`;

    return match;
  });
