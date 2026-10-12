import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

import { resolveLandingFile } from '#server/adapters/uploads/landingFiles';

/**
 * Картинки лендинга с тома (issue #478): `/uploads/landings/<id версии>/<путь из архива>`.
 *
 * Устроено как отдача фото товара (`server/routes/uploads/products/[file].get.ts`) и по тем же
 * причинам: отдаёт приложение, а не дверь машины, и адрес без `/api`.
 *
 * Отдаются только картинки — по расширению из `LANDING_IMAGE_EXTENSIONS`, с типом по нему же.
 * HTML с тома не отдаётся вообще: лендинг попадает в страницу только разметкой через компонент
 * приложения, а `index.html` по прямому адресу исполнил бы всё, что очистка вырезала из базы.
 *
 * **Доступ не проверяется намеренно:** картинку увидит каждый, кому покажут лендинг, — кандидат
 * в Mini App без cookie веба. Id версии не угадывается — это uuid.
 *
 * Кэш вечный: версия после записи не меняется, замена архива ложится новой версией по новому адресу.
 */

const CACHE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

const notFound = () =>
  createError({
    statusCode: 404,
    statusMessage: 'Not Found',
    message: 'такого файла нет',
  });

export default defineEventHandler(async (event) => {
  // Путь целиком, с косыми чертами: первый сегмент — id версии, остальное — путь внутри архива.
  // Раскрытый `%2e%2e` разбирает адаптер: путь с `..` он не принимает.
  const [versionId = '', ...rest] = (getRouterParam(event, 'path', { decode: true }) ?? '').split('/');
  const file = resolveLandingFile(versionId, rest.join('/'));

  if (!file) {
    throw notFound();
  }

  let size: number;

  try {
    const stats = await stat(file.path);

    if (!stats.isFile()) throw notFound();

    size = stats.size;
  } catch {
    throw notFound();
  }

  setResponseHeaders(event, {
    'Content-Type': file.contentType,
    'Content-Length': String(size),
    'Cache-Control': `public, max-age=${CACHE_MAX_AGE_SECONDS}, immutable`,
  });

  return sendStream(event, createReadStream(file.path));
});
