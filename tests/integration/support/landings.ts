import { strToU8, zipSync } from 'fflate';

import { db } from '#server/db';

/**
 * Архивы и уборка лендингов «Промо» (issue #478).
 *
 * Лендинги убираются по id, которые тест завёл или прочитал, — вместе с версиями. Метки, у которых
 * стоит лендинг, ссылаются на него с `RESTRICT`, поэтому уборка меток (`cleanupTestPromoTouches`)
 * идёт раньше этой.
 */

const createdLandingIds = new Set<string>();

export const trackTestLanding = (landingId: string): void => {
  createdLandingIds.add(landingId);
};

const page = (body: string): string =>
  `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`;

/** Архив, который проходит все четыре пункта: поле имени, кнопка и картинка на месте. */
export const passingLandingArchive = (): Uint8Array =>
  zipSync({
    'index.html': strToU8(page('<img src="img/hero.jpg"><input data-xb-name><button data-xb-submit>Заявка</button>')),
    'img/hero.jpg': new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
  });

/** Архив без поля имени — сохраняется, но проверку не проходит. */
export const failingLandingArchive = (): Uint8Array =>
  zipSync({ 'index.html': strToU8(page('<button data-xb-submit>Заявка</button>')) });

export const cleanupTestLandings = async (): Promise<void> => {
  const ids = [...createdLandingIds];
  createdLandingIds.clear();

  if (ids.length === 0) return;

  await db.landingVersion.deleteMany({ where: { landingId: { in: ids } } });
  await db.landing.deleteMany({ where: { id: { in: ids } } });
};
