import { unzipSync, type UnzipFileInfo } from 'fflate';
import { parse, serialize, type DefaultTreeAdapterTypes } from 'parse5';

import { LandingFailure } from '#server/services/promo/landingFailure';
import {
  classifyLandingReference,
  LANDING_MAX_ARCHIVE_BYTES,
  landingImageContentType,
  mapCssUrls,
  mapSrcset,
  normalizeLandingPath,
} from '#shared/landings';
import type { LandingCheck } from '#shared/types/landings';

/**
 * Разбор, проверка и очистка архива лендинга (issue #478) — чистая функция над байтами:
 * без базы и без тома. Её зовут и проверка в окне загрузки, и сама загрузка.
 *
 * Отказ — только у архива, который не разобрать: больше 5 МБ или не `.zip`. Всё остальное —
 * проверка из четырёх пунктов, и лендинг сохраняется при любом её итоге: не прошедший нельзя
 * выбрать у метки, но можно исправить заменой (docs/decisions.md → «Лендинги в „Промо“»).
 *
 * Очистка — молча, без пункта проверки: вырезается то, что исполнилось бы в странице приложения.
 * Разметка разбирается `parse5` по правилам браузера и чистится обходом дерева — так правила
 * очистки целиком видны здесь, а не в чужом белом списке.
 */

type Element = DefaultTreeAdapterTypes.Element;
type ParentNode = DefaultTreeAdapterTypes.ParentNode;
type ChildNode = DefaultTreeAdapterTypes.ChildNode;
type TextNode = DefaultTreeAdapterTypes.TextNode;

export type LandingImageFile = {
  /** Путь внутри архива после нормализации — с ним картинка ложится на том. */
  path: string;
  bytes: Uint8Array;
};

export type LandingInspection = {
  checks: LandingCheck[];
  passed: boolean;
  /** `index.html` после очистки. Нет `index.html` — пусто. */
  html: string;
  /** Картинки архива, на которые есть ссылки, — только они ложатся на том. */
  images: LandingImageFile[];
};

const INDEX_FILE = 'index.html';

/**
 * Сколько байт архив может развернуть в память. Сам архив — до 5 МБ, но сжатый файл
 * разворачивается во много раз больше, и архив из нулей занял бы всю память приложения.
 * Картинок и разметки одной страницы с запасом хватает и половины этого.
 */
const MAX_UNPACKED_BYTES = 64 * 1024 * 1024;

/** Элементы, которые вырезаются целиком: исполняемое, вложенные документы и чужие ресурсы. */
const REMOVED_ELEMENTS = new Set(['script', 'iframe', 'object', 'embed', 'base', 'link']);

/** Атрибуты-адреса, значение которых не должно начинаться с `javascript:`. */
const URL_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction']);

/**
 * Анимации SVG, которые умеют менять атрибут ссылки. Нацеленная на `href` анимация подставляет
 * ссылке `javascript:` уже после разбора — мимо проверки атрибутов, — поэтому такая вырезается
 * целиком. Остальные анимации SVG — цвет, положение — безвредны и остаются.
 */
const ANIMATION_ELEMENTS = new Set(['animate', 'set', 'animatemotion']);

const LINK_ATTRIBUTE_NAMES = new Set(['href', 'xlink:href']);

/**
 * `@import` в стилях — целиком, с адресом в кавычках или в `url(…)`, до точки с запятой. Через него
 * грузятся чужой CSS и шрифты, а лендинг целиком лежит у нас.
 */
const CSS_IMPORT_PATTERN = /@import\s*(?:url\(\s*(?:"[^"]*"|'[^']*'|[^)]*)\s*\)|"[^"]*"|'[^']*')[^;]*;?/gi;

const FORMATS_TEXT = 'Подходят JPEG, PNG и WebP';

// ---------------------------------------------------------------------------
// Архив
// ---------------------------------------------------------------------------

type ArchiveEntry = {
  /** Имя в архиве как есть — по нему файл достаётся. */
  name: string;
  size: number;
};

/** Разворачивает из архива только названные файлы. */
const extract = (bytes: Uint8Array, names: ReadonlySet<string>): Record<string, Uint8Array> => {
  if (names.size === 0) return {};

  try {
    return unzipSync(bytes, { filter: (file: UnzipFileInfo) => names.has(file.name) });
  } catch {
    throw new LandingFailure('landing_archive_invalid');
  }
};

/**
 * Файлы архива по нормализованному пути. Каталоги и файлы с путём, который не принимается
 * (`..`, от корня), в список не попадают — такой файл не считается найденным.
 *
 * Список собирается без распаковки: фильтр видит имя и размер каждого файла и отвечает «не надо».
 */
const listEntries = (bytes: Uint8Array): Map<string, ArchiveEntry> => {
  const entries = new Map<string, ArchiveEntry>();

  try {
    unzipSync(bytes, {
      filter: (file: UnzipFileInfo) => {
        const path = file.name.endsWith('/') ? null : normalizeLandingPath(file.name);

        if (path !== null && !entries.has(path)) {
          entries.set(path, { name: file.name, size: file.originalSize });
        }

        return false;
      },
    });
  } catch {
    throw new LandingFailure('landing_archive_invalid');
  }

  return entries;
};

// ---------------------------------------------------------------------------
// Дерево
// ---------------------------------------------------------------------------

const isElement = (node: ChildNode | ParentNode): node is Element => 'tagName' in node;

const isTextNode = (node: ChildNode): node is TextNode => node.nodeName === '#text';

const readAttribute = (element: Element, name: string): string | null =>
  element.attrs.find((attribute) => attribute.name === name)?.value ?? null;

const hasAttribute = (element: Element, name: string): boolean =>
  element.attrs.some((attribute) => attribute.name === name);

/** Дети узла, а у `<template>` — ещё и его содержимое: разметка в нём тоже попадает в страницу. */
const childrenOf = (node: ParentNode): ChildNode[] => {
  const content = 'content' in node ? (node as DefaultTreeAdapterTypes.Template).content : null;

  return content ? [...node.childNodes, ...content.childNodes] : node.childNodes;
};

/** Все элементы дерева в порядке документа. */
const collectElements = (root: ParentNode): Element[] => {
  const elements: Element[] = [];
  const visit = (node: ParentNode): void => {
    for (const child of childrenOf(node)) {
      if (isElement(child)) {
        elements.push(child);
        visit(child);
      }
    }
  };

  visit(root);

  return elements;
};

/** `javascript:` с пробелами и управляющими символами внутри: браузер их выбрасывает перед разбором. */
const isJavascriptUrl = (value: string): boolean =>
  value.replace(/[\u0000- ]/g, '').toLowerCase().startsWith('javascript:');

/** Заменяет узел в родителе списком узлов. */
const replaceNode = (node: ChildNode, replacement: ChildNode[]): void => {
  const parent = node.parentNode;

  if (!parent) return;

  const index = parent.childNodes.indexOf(node);

  if (index === -1) return;

  for (const child of replacement) child.parentNode = parent;

  parent.childNodes.splice(index, 1, ...replacement);
};

/** Анимация SVG, нацеленная на ссылку: `attributeName` — `href` или `xlink:href`. */
const animatesLink = (element: Element, tag: string): boolean => {
  if (!ANIMATION_ELEMENTS.has(tag)) return false;

  const target = element.attrs.find((attribute) => attribute.name.toLowerCase() === 'attributename');

  return target !== undefined && LINK_ATTRIBUTE_NAMES.has(target.value.trim().toLowerCase());
};

/** Очистка дерева: правила issue #478, раздел «Разбор, проверка и очистка архива». */
const sanitize = (root: ParentNode): void => {
  for (const element of collectElements(root)) {
    const tag = element.tagName.toLowerCase();

    if (
      REMOVED_ELEMENTS.has(tag) ||
      (tag === 'meta' && hasAttribute(element, 'http-equiv')) ||
      animatesLink(element, tag)
    ) {
      replaceNode(element, []);
      continue;
    }

    if (tag === 'style') {
      for (const child of element.childNodes) {
        if (isTextNode(child)) child.value = child.value.replace(CSS_IMPORT_PATTERN, '');
      }
    }

    // Форма снимается, содержимое остаётся: отправлять её некуда, а поле и кнопку находит приложение.
    if (tag === 'form') {
      replaceNode(element, [...element.childNodes]);
    }

    element.attrs = element.attrs.filter(
      (attribute) =>
        !attribute.name.toLowerCase().startsWith('on') &&
        !(URL_ATTRIBUTES.has(attribute.name.toLowerCase()) && isJavascriptUrl(attribute.value)),
    );

    if (tag === 'button' && hasAttribute(element, 'data-xb-submit')) {
      element.attrs = [...element.attrs.filter((attribute) => attribute.name !== 'type'), { name: 'type', value: 'button' }];
    }
  }
};

// ---------------------------------------------------------------------------
// Проверка
// ---------------------------------------------------------------------------

const countProblem = (found: number, missing: string, many: string): string[] => {
  if (found === 0) return [missing];
  if (found > 1) return [`${many}: ${found}`];

  return [];
};

const checkNameField = (elements: Element[]): LandingCheck => {
  const fields = elements.filter((element) => element.tagName === 'input' && hasAttribute(element, 'data-xb-name'));
  const problems = countProblem(fields.length, 'Поле с data-xb-name не найдено', 'Полей с data-xb-name несколько');
  const [field] = fields;

  if (fields.length === 1 && field) {
    const type = readAttribute(field, 'type');

    // Номер приложение просит у Telegram само; поле лендинга — только имя, обычным текстом.
    if (type !== null && type.trim().toLowerCase() !== 'text') {
      problems.push(`Поле с data-xb-name не текстовое: type="${type}"`);
    }
  }

  return { key: 'name_field', ok: problems.length === 0, problems };
};

const checkSubmitButton = (elements: Element[]): LandingCheck => {
  const buttons = elements.filter((element) => element.tagName === 'button' && hasAttribute(element, 'data-xb-submit'));
  const problems = countProblem(buttons.length, 'Кнопка с data-xb-submit не найдена', 'Кнопок с data-xb-submit несколько');

  return { key: 'submit_button', ok: problems.length === 0, problems };
};

/** Все ссылки на картинки в разметке — тем же разбором, которым их переписывает компонент лендинга. */
const collectImageReferences = (elements: Element[]): string[] => {
  const references: string[] = [];
  const keep = (url: string): string => {
    references.push(url);

    return url;
  };

  for (const element of elements) {
    if (element.tagName === 'img' || element.tagName === 'source') {
      const src = readAttribute(element, 'src');
      const srcset = readAttribute(element, 'srcset');

      if (src !== null) references.push(src);
      if (srcset !== null) mapSrcset(srcset, keep);
    }

    const style = readAttribute(element, 'style');

    if (style !== null) mapCssUrls(style, keep);

    if (element.tagName === 'style') {
      for (const child of element.childNodes) {
        if (isTextNode(child)) mapCssUrls(child.value, keep);
      }
    }
  }

  return references.map((reference) => reference.trim()).filter((reference) => reference !== '');
};

/** Путь файла архива из относительной ссылки: без `?` и `#`, с раскрытыми `%20`. */
const referencePath = (reference: string): string | null => {
  const bare = reference.replace(/[?#].*$/, '');

  try {
    return normalizeLandingPath(decodeURIComponent(bare));
  } catch {
    return normalizeLandingPath(bare);
  }
};

const checkImages = (
  references: string[],
  entries: ReadonlyMap<string, ArchiveEntry>,
): { check: LandingCheck; paths: Set<string> } => {
  const problems = new Set<string>();
  const paths = new Set<string>();

  for (const reference of references) {
    const kind = classifyLandingReference(reference);

    if (kind === 'fragment') continue;

    if (kind === 'data') {
      // Встроенная не картинка называется своим типом: сама строка `data:` бывает в мегабайт.
      if (!/^data:image\//i.test(reference)) {
        problems.add(`Формат картинки не поддерживается: ${reference.split(/[;,]/)[0] ?? 'data:'}. ${FORMATS_TEXT}`);
      }

      continue;
    }

    if (kind === 'external') {
      problems.add(`Картинка по внешней ссылке: ${reference}`);
      continue;
    }

    const path = referencePath(reference);

    if (path === null) {
      problems.add(`Нет файла ${reference}`);
    } else if (landingImageContentType(path) === null) {
      problems.add(`Формат картинки не поддерживается: ${reference}. ${FORMATS_TEXT}`);
    } else if (!entries.has(path)) {
      problems.add(`Нет файла ${reference}`);
    } else {
      paths.add(path);
    }
  }

  return { check: { key: 'images', ok: problems.size === 0, problems: [...problems] }, paths };
};

// ---------------------------------------------------------------------------
// Итог
// ---------------------------------------------------------------------------

/** Нет `index.html` — остальные пункты не проверялись и не прошли. */
const withoutIndex = (): LandingInspection => {
  const skipped = ['Не проверено: в архиве нет index.html'];

  return {
    checks: [
      { key: 'index', ok: false, problems: ['В корне архива нет index.html'] },
      { key: 'name_field', ok: false, problems: skipped },
      { key: 'submit_button', ok: false, problems: skipped },
      { key: 'images', ok: false, problems: skipped },
    ],
    passed: false,
    html: '',
    images: [],
  };
};

export const inspectLandingArchive = (bytes: Uint8Array): LandingInspection => {
  if (bytes.byteLength > LANDING_MAX_ARCHIVE_BYTES) {
    throw new LandingFailure('landing_archive_too_large');
  }

  const entries = listEntries(bytes);
  const index = entries.get(INDEX_FILE);

  if (index === undefined) {
    return withoutIndex();
  }

  if (index.size > MAX_UNPACKED_BYTES) {
    throw new LandingFailure('landing_archive_invalid');
  }

  const indexBytes = extract(bytes, new Set([index.name]))[index.name];

  if (indexBytes === undefined) {
    throw new LandingFailure('landing_archive_invalid');
  }

  const document = parse(new TextDecoder('utf-8').decode(indexBytes));

  sanitize(document);

  const elements = collectElements(document);
  const images = checkImages(collectImageReferences(elements), entries);
  const checks: LandingCheck[] = [
    { key: 'index', ok: true, problems: [] },
    checkNameField(elements),
    checkSubmitButton(elements),
    images.check,
  ];

  const wanted = [...images.paths].flatMap((path) => {
    const entry = entries.get(path);

    return entry ? [{ path, entry }] : [];
  });

  const unpacked = wanted.reduce((total, { entry }) => total + entry.size, index.size);

  if (unpacked > MAX_UNPACKED_BYTES) {
    throw new LandingFailure('landing_archive_invalid');
  }

  const files = extract(bytes, new Set(wanted.map(({ entry }) => entry.name)));

  return {
    checks,
    passed: checks.every((check) => check.ok),
    html: serialize(document),
    images: wanted.flatMap(({ path, entry }) => {
      const file = files[entry.name];

      return file ? [{ path, bytes: file }] : [];
    }),
  };
};
