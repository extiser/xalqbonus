import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

import { resolveGiftCoverFile } from '#server/adapters/uploads/giftCovers';

/**
 * Отдача обложки подарка с тома (issue #219) — тем же способом, что фото рассылки: поток файла
 * с типом по расширению.
 *
 * **Доступ не проверяется**, как у фото товара, а не как у фото рассылки: обложку показывает
 * Mini App водителя, а `<img>` там идёт без cookie веба и без заголовка с `initData`. Подарок
 * уже вручён, и тайны в картинке нет; имя файла не угадывается — это uuid раздачи.
 *
 * Кэш длинный: обложка по своему адресу не меняется никогда — раздача не правится.
 */

/** Год. */
const CACHE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

const CONTENT_TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const notFound = () => createError({ statusCode: 404, statusMessage: 'Not Found', message: 'такого файла нет' });

export default defineEventHandler(async (event) => {
  const fileName = getRouterParam(event, 'file') ?? '';
  const path = resolveGiftCoverFile(fileName);

  if (!path) {
    throw notFound();
  }

  let size: number;

  try {
    size = (await stat(path)).size;
  } catch {
    throw notFound();
  }

  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';

  setResponseHeaders(event, {
    'Content-Type': CONTENT_TYPE_BY_EXTENSION[extension] ?? 'application/octet-stream',
    'Content-Length': String(size),
    'Cache-Control': `public, max-age=${CACHE_MAX_AGE_SECONDS}, immutable`,
  });

  return sendStream(event, createReadStream(path));
});
