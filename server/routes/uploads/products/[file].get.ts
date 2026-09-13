import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

import { resolveProductPhotoFile } from '#server/adapters/uploads/productPhotos';

/**
 * Отдача фото товара с тома.
 *
 * Отдаёт приложение, а не дверь машины: nginx хоста в том контейнера не смотрит, а bind-mount
 * ради сотни картинок — лишняя строка в compose и ещё одна вещь, которую надо помнить при
 * переезде на Caddy (docs/decisions.md → «Фото товара — файл на именованном томе приложения»).
 *
 * Лежит в `server/routes/`, а не в `server/api/`: адрес у картинки без префикса `/api` —
 * он попадает в разметку и в кэш браузера, и «интерфейс приложения» тут ни при чём.
 *
 * **Доступ не проверяется намеренно.** Картинка товара — то же самое, что картинка в витрине
 * водителя: её увидит каждый, кому открыта витрина, а витрина открыта всем участникам
 * программы. Проверка сессии здесь означала бы, что `<img>` в Mini App не грузится без cookie
 * веба. Имя файла при этом не угадывается — это uuid товара.
 *
 * Кэш длинный, потому что содержимое по этому адресу не меняется... почти: имя файла собрано
 * из uuid и расширения, и перезалитая картинка того же формата ложится по тому же адресу.
 * Поэтому разметка приписывает к адресу `?v=<updatedAt>` — отметка двигается записью фото,
 * и браузер идёт за файлом заново.
 */

/** Год. Столько живёт адрес с версией в строке запроса — большего ему не нужно. */
const CACHE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

const CONTENT_TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export default defineEventHandler(async (event) => {
  const fileName = getRouterParam(event, 'file') ?? '';
  const path = resolveProductPhotoFile(fileName);

  // Имя не нашего вида — открывать по нему нечего. Разбирается это до обращения к диску:
  // `..%2f..%2f.env` в адресе — то, ради чего проверка имени и стоит.
  if (!path) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: 'такого файла нет',
    });
  }

  // Размер спрашивается до отдачи: без `Content-Length` браузер не показывает прогресс,
  // а отсутствующий файл иначе обнаружился бы на середине потока — ответом 200 без тела.
  let size: number;

  try {
    size = (await stat(path)).size;
  } catch {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: 'такого файла нет',
    });
  }

  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';

  setResponseHeaders(event, {
    'Content-Type': CONTENT_TYPE_BY_EXTENSION[extension] ?? 'application/octet-stream',
    'Content-Length': String(size),
    'Cache-Control': `public, max-age=${CACHE_MAX_AGE_SECONDS}, immutable`,
  });

  return sendStream(event, createReadStream(path));
});
