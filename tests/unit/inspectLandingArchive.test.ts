import { readFileSync } from 'node:fs';

import { strToU8, zipSync, type Zippable } from 'fflate';
import { describe, expect, it } from 'vitest';

import { inspectLandingArchive, type LandingInspection } from '#server/services/promo/inspectLandingArchive';
import { LANDING_MAX_ARCHIVE_BYTES } from '#shared/landings';
import type { LandingCheck, LandingCheckKey } from '#shared/types/landings';

/**
 * Разбор, проверка и очистка архива лендинга (issue #478). Архивы собираются здесь же `fflate`:
 * проверка смотрит на содержимое, и каждый случай — свой маленький архив.
 */

/** Картинка — байты не важны: проверка смотрит на имя и наличие файла, а не на формат внутри. */
const IMAGE = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

const page = (body: string, head = ''): string =>
  `<!doctype html><html><head><meta charset="utf-8">${head}</head><body>${body}</body></html>`;

const NAME = '<input data-xb-name placeholder="Имя">';
const BUTTON = '<button data-xb-submit>Оставить заявку</button>';

const archive = (files: Record<string, string | Uint8Array>): Uint8Array => {
  const zippable: Zippable = {};

  for (const [name, content] of Object.entries(files)) {
    zippable[name] = typeof content === 'string' ? strToU8(content) : content;
  }

  return zipSync(zippable);
};

const check = (inspection: LandingInspection, key: LandingCheckKey): LandingCheck => {
  const found = inspection.checks.find((item) => item.key === key);

  if (!found) throw new Error(`нет пункта ${key}`);

  return found;
};

const failure = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error;
  }

  throw new Error('отказа не было');
};

describe('inspectLandingArchive — проверка', () => {
  it('всё на месте — четыре пункта прошли, на том ложится картинка из ссылки', () => {
    const inspection = inspectLandingArchive(
      archive({
        'index.html': page(`<img src="img/hero.jpg">${NAME}${BUTTON}`),
        'img/hero.jpg': IMAGE,
        'img/unused.png': IMAGE,
      }),
    );

    expect(inspection.passed).toBe(true);
    expect(inspection.checks.map((item) => [item.key, item.ok])).toEqual([
      ['index', true],
      ['name_field', true],
      ['submit_button', true],
      ['images', true],
    ]);
    expect(inspection.images.map((image) => image.path)).toEqual(['img/hero.jpg']);
  });

  it('шаблон «Скачать шаблон» загружается как есть и проходит все четыре пункта', () => {
    const template = readFileSync(new URL('../../public/landing-template.zip', import.meta.url));
    const inspection = inspectLandingArchive(new Uint8Array(template));

    expect(inspection.checks.filter((item) => !item.ok)).toEqual([]);
    expect(inspection.images.map((image) => image.path)).toEqual(['img/hero.jpg']);
  });

  it('нет index.html в корне — остальные три пункта не проверяются и не прошли', () => {
    const inspection = inspectLandingArchive(archive({ 'landing/index.html': page(`${NAME}${BUTTON}`) }));

    expect(inspection.passed).toBe(false);
    expect(inspection.checks.every((item) => !item.ok)).toBe(true);
    expect(inspection.html).toBe('');
    expect(inspection.images).toEqual([]);
  });

  it('поля имени нет — не прошёл', () => {
    const inspection = inspectLandingArchive(archive({ 'index.html': page(BUTTON) }));

    expect(check(inspection, 'name_field')).toEqual({
      key: 'name_field',
      ok: false,
      problems: ['Поле с data-xb-name не найдено'],
    });
    expect(inspection.passed).toBe(false);
  });

  it('два поля имени — не прошёл, с числом', () => {
    const inspection = inspectLandingArchive(archive({ 'index.html': page(`${NAME}${NAME}${BUTTON}`) }));

    expect(check(inspection, 'name_field').problems).toEqual(['Полей с data-xb-name несколько: 2']);
  });

  it('поле имени type="email" — не прошёл; type="text" — прошёл', () => {
    const email = inspectLandingArchive(archive({ 'index.html': page(`<input data-xb-name type="email">${BUTTON}`) }));
    const text = inspectLandingArchive(archive({ 'index.html': page(`<input data-xb-name type="text">${BUTTON}`) }));

    expect(check(email, 'name_field').ok).toBe(false);
    expect(check(text, 'name_field').ok).toBe(true);
  });

  it('кнопки нет и кнопок две — не прошёл', () => {
    const none = inspectLandingArchive(archive({ 'index.html': page(NAME) }));
    const two = inspectLandingArchive(archive({ 'index.html': page(`${NAME}${BUTTON}${BUTTON}`) }));

    expect(check(none, 'submit_button').problems).toEqual(['Кнопка с data-xb-submit не найдена']);
    expect(check(two, 'submit_button').problems).toEqual(['Кнопок с data-xb-submit несколько: 2']);
  });

  it('картинки нет в архиве — «Нет файла»', () => {
    const inspection = inspectLandingArchive(archive({ 'index.html': page(`<img src="img/car.jpg">${NAME}${BUTTON}`) }));

    expect(check(inspection, 'images').problems).toEqual(['Нет файла img/car.jpg']);
    expect(inspection.passed).toBe(false);
  });

  it('картинка по внешней ссылке и по // — не прошёл', () => {
    const inspection = inspectLandingArchive(
      archive({
        'index.html': page(`<img src="https://example.com/a.jpg"><img src="//cdn.example.com/b.jpg">${NAME}${BUTTON}`),
      }),
    );

    expect(check(inspection, 'images').problems).toEqual([
      'Картинка по внешней ссылке: https://example.com/a.jpg',
      'Картинка по внешней ссылке: //cdn.example.com/b.jpg',
    ]);
  });

  it('svg — формат не поддерживается, даже если файл в архиве', () => {
    const inspection = inspectLandingArchive(
      archive({ 'index.html': page(`<img src="img/car.svg">${NAME}${BUTTON}`), 'img/car.svg': '<svg/>' }),
    );

    expect(check(inspection, 'images').problems).toEqual([
      'Формат картинки не поддерживается: img/car.svg. Подходят JPEG, PNG и WebP',
    ]);
    expect(inspection.images).toEqual([]);
  });

  it('data:image проходит и на том не ложится', () => {
    const inspection = inspectLandingArchive(
      archive({ 'index.html': page(`<img src="data:image/png;base64,iVBORw0KGgo=">${NAME}${BUTTON}`) }),
    );

    expect(check(inspection, 'images').ok).toBe(true);
    expect(inspection.images).toEqual([]);
  });

  it('картинки в url() стиля, в атрибуте style и в srcset — ищутся и ложатся на том', () => {
    const inspection = inspectLandingArchive(
      archive({
        'index.html': page(
          `<div style="background: url('img/bg.webp')"></div>
           <img src="img/a.jpg" srcset="img/a.jpg 1x, ./img/a@2x.png 2x, data:image/png;base64,AAAA 3x">
           ${NAME}${BUTTON}`,
          '<style>.hero { background-image: url("img/hero.jpeg"); } .missing { background: url(img/none.png) }</style>',
        ),
        'img/bg.webp': IMAGE,
        'img/a.jpg': IMAGE,
        'img/a@2x.png': IMAGE,
        'img/hero.jpeg': IMAGE,
      }),
    );

    expect(check(inspection, 'images').problems).toEqual(['Нет файла img/none.png']);
    expect(inspection.images.map((image) => image.path).sort()).toEqual([
      'img/a.jpg',
      'img/a@2x.png',
      'img/bg.webp',
      'img/hero.jpeg',
    ]);
  });

  it('путь с .. — файл не считается найденным, даже если он в архиве', () => {
    const inspection = inspectLandingArchive(
      archive({ 'index.html': page(`<img src="../secret.jpg">${NAME}${BUTTON}`), '../secret.jpg': IMAGE }),
    );

    expect(check(inspection, 'images').problems).toEqual(['Нет файла ../secret.jpg']);
    expect(inspection.images).toEqual([]);
  });
});

describe('inspectLandingArchive — отказы', () => {
  it('больше 5 МБ — landing_archive_too_large', () => {
    const big = new Uint8Array(LANDING_MAX_ARCHIVE_BYTES + 1);

    expect(failure(() => inspectLandingArchive(big))).toMatchObject({ code: 'landing_archive_too_large' });
  });

  it('не архив — landing_archive_invalid', () => {
    expect(failure(() => inspectLandingArchive(strToU8('<html>не архив</html>')))).toMatchObject({
      code: 'landing_archive_invalid',
    });
  });
});

describe('inspectLandingArchive — очистка', () => {
  const clean = (body: string, head = ''): string =>
    inspectLandingArchive(archive({ 'index.html': page(body, head) })).html;

  it('script вырезается целиком, и в head, и в body', () => {
    const html = clean(`${NAME}${BUTTON}<script>alert(1)</script>`, '<script src="x.js"></script>');

    expect(html).not.toMatch(/<script/i);
    expect(html).not.toContain('alert');
  });

  it('onerror и любые on… снимаются', () => {
    const html = clean(`<img src="img/a.jpg" onerror="alert(1)"><div onClick="steal()">x</div>${NAME}${BUTTON}`);

    expect(html).not.toMatch(/onerror|onclick/i);
    expect(html).toContain('src="img/a.jpg"');
  });

  it('javascript: в href снимается, и с пробелами впереди', () => {
    const html = clean(`<a href="  JavaScript:alert(1)">тык</a><a href="https://example.com">ок</a>${NAME}${BUTTON}`);

    expect(html).not.toMatch(/javascript:/i);
    expect(html).toContain('href="https://example.com"');
  });

  it('form снимается, содержимое остаётся', () => {
    const html = clean(`<form action="https://evil.example" method="post"><p>внутри</p>${NAME}${BUTTON}</form>`);

    expect(html).not.toMatch(/<form/i);
    expect(html).toContain('<p>внутри</p>');
    expect(html).toContain('data-xb-name');
  });

  it('кнопке data-xb-submit ставится type="button"', () => {
    const html = clean(`${NAME}<button data-xb-submit type="submit">Отправить</button>`);

    expect(html).toContain('<button data-xb-submit="" type="button">Отправить</button>');
  });

  it('анимация SVG, подставляющая ссылке javascript:, вырезается; остальные анимации остаются', () => {
    const html = clean(
      `<svg><a><set attributeName="href" to="javascript:alert(1)"/><text>тык</text></a>
        <a><animate attributeName=" XLINK:href " values="javascript:alert(2)"/></a>
        <circle r="5"><animate attributeName="r" values="5;10;5" dur="1s"/></circle></svg>${NAME}${BUTTON}`,
    );

    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toMatch(/<set\b/i);
    expect(html).toContain('attributeName="r"');
  });

  it('@import в стилях вырезается целиком, остальные правила остаются', () => {
    const html = clean(
      `${NAME}${BUTTON}`,
      '<style>@import "https://example.com/a.css"; @import url(https://example.com/b.css); .lp { color: red; }</style>',
    );

    expect(html).not.toMatch(/@import|example\.com/i);
    expect(html).toContain('.lp { color: red; }');
  });

  it('iframe, object, embed, base, link и meta http-equiv вырезаются', () => {
    const html = clean(
      `<iframe src="https://x"></iframe><object data="x"></object><embed src="x">${NAME}${BUTTON}`,
      '<base href="https://evil.example/"><link rel="stylesheet" href="x.css"><meta http-equiv="refresh" content="0;url=https://evil.example">',
    );

    expect(html).not.toMatch(/<(iframe|object|embed|base|link)\b/i);
    expect(html).not.toMatch(/http-equiv/i);
    expect(html).toContain('<meta charset="utf-8">');
  });
});
