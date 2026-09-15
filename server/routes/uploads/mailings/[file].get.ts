import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

import { resolveMailingPhotoFile } from '#server/adapters/uploads/mailingPhotos';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { MAILING_ROLES } from '#shared/access';

/**
 * Отдача фото рассылки с тома — для экрана рассылок.
 *
 * В отличие от фото товара, доступ проверяется: картинку черновика видит только тот, кому
 * открыт раздел, а до запуска рассылка — внутреннее дело парка. `<img>` в вебе идёт с cookie,
 * и проверка ему не мешает. Водителю фото уходит байтами в Telegram, этот адрес ему не нужен.
 *
 * Кэш короткий и частный: адрес несёт версию `?v=<updatedAt>`, но картинка закрыта доступом,
 * и общим кэшам прокси лежать ей незачем.
 */

const CONTENT_TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export default defineEventHandler(async (event) => {
  await requireEmployeeRole(event, MAILING_ROLES);

  const fileName = getRouterParam(event, 'file') ?? '';
  const path = resolveMailingPhotoFile(fileName);

  if (!path) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'такого файла нет' });
  }

  let size: number;

  try {
    size = (await stat(path)).size;
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'такого файла нет' });
  }

  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';

  setResponseHeaders(event, {
    'Content-Type': CONTENT_TYPE_BY_EXTENSION[extension] ?? 'application/octet-stream',
    'Content-Length': String(size),
    'Cache-Control': 'private, max-age=3600',
  });

  return sendStream(event, createReadStream(path));
});
