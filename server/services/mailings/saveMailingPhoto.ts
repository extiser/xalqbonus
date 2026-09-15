import { consola } from 'consola';
import { writeMailingPhoto } from '#server/adapters/uploads/mailingPhotos';
import { findMailing, updateDraftMailingPhotoPath } from '#server/repositories/mailings';
import {
  MailingPhotoTooLargeError,
  MailingPhotoTypeNotAllowedError,
  MailingStatusMismatchError,
  UnknownMailingError,
} from '#server/services/mailings/errors';
import { readMailing } from '#server/services/mailings/readMailing';
import { MAX_PHOTO_BYTES, PHOTO_EXTENSION_BY_TYPE } from '#shared/photo';
import type { Mailing } from '#shared/types/mailing';

/**
 * Фото рассылки: файл на том, относительный путь в колонку. Только у черновика.
 *
 * Порядок тот же, что у фото товара (server/services/products/saveProductPhoto.ts): сначала
 * файл, потом колонка — иначе рассылка ссылалась бы на файл, которого нет.
 *
 * Длина текстов здесь не проверяется: с фото потолок склейки падает до 1024, но черновик —
 * рабочее состояние, и человек вправе сначала положить картинку, а потом подрезать текст.
 * Перебор показывает форма, а не пускает запуск (issue #136, прогон 15-09-2026).
 */
const log = consola.withTag('mailings:photo');

export type SaveMailingPhotoInput = {
  mailingId: string;
  contentType: string;
  bytes: Buffer;
};

export const saveMailingPhoto = async (input: SaveMailingPhotoInput): Promise<Mailing> => {
  if (!PHOTO_EXTENSION_BY_TYPE[input.contentType]) {
    throw new MailingPhotoTypeNotAllowedError(input.contentType);
  }

  if (input.bytes.byteLength > MAX_PHOTO_BYTES) {
    throw new MailingPhotoTooLargeError(input.bytes.byteLength, MAX_PHOTO_BYTES);
  }

  const current = await findMailing(input.mailingId);

  if (!current) {
    throw new UnknownMailingError(input.mailingId);
  }

  if (current.status !== 'draft') {
    throw new MailingStatusMismatchError(input.mailingId, current.status, 'draft');
  }

  const photoPath = await writeMailingPhoto(input.mailingId, input.contentType, input.bytes);

  if (!(await updateDraftMailingPhotoPath(input.mailingId, photoPath))) {
    // Запустили между чтением и записью. Файл при этом переписан — у запущенной рассылки
    // на томе теперь новая картинка при старом пути, и уходить будет она. Окно — доли
    // секунды между двумя нажатиями двух сотрудников, и сказать о нём честнее, чем молчать.
    log.warn('фото легло на том, но рассылка уже не черновик', { mailingId: input.mailingId });

    throw new MailingStatusMismatchError(input.mailingId, 'running', 'draft');
  }

  log.info('фото рассылки записано', {
    mailingId: input.mailingId,
    photoPath,
    bytes: input.bytes.byteLength,
  });

  return readMailing(input.mailingId);
};
