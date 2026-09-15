import { consola } from 'consola';
import { copyMailingPhoto } from '#server/adapters/uploads/mailingPhotos';
import {
  findMailing,
  insertDraftMailing,
  updateDraftMailingPhotoPath,
} from '#server/repositories/mailings';
import {
  MailingStatusMismatchError,
  UnknownMailingError,
} from '#server/services/mailings/errors';
import { readMailing } from '#server/services/mailings/readMailing';
import type { Mailing } from '#shared/types/mailing';

/**
 * Копия остановленной рассылки в новый черновик: заголовок, тексты и фото.
 *
 * Снимок не копируется. Новая рассылка снимет свой при запуске, и те, кто получил сообщение
 * от остановленной, получат его снова — копия означает «разослать заново», а не «дослать».
 * Дослать только оставшимся нельзя по построению: снимок оригинала относится к моменту его
 * запуска, а парк с тех пор поменялся.
 *
 * Фото копируется файлом, а не ссылкой: замена картинки в копии иначе переписала бы файл
 * оригинала.
 */
const log = consola.withTag('mailings:copy');

export const copyMailing = async (mailingId: string, createdById: string): Promise<Mailing> => {
  const source = await findMailing(mailingId);

  if (!source) {
    throw new UnknownMailingError(mailingId);
  }

  if (source.status !== 'stopped') {
    throw new MailingStatusMismatchError(mailingId, source.status, 'stopped');
  }

  const copyId = await insertDraftMailing({
    title: source.title,
    textRu: source.textRu,
    textUz: source.textUz,
    photoPath: null,
    createdById,
  });

  // Сначала черновик, потом файл под его идентификатор: имя файла собирается из uuid
  // рассылки, а uuid рождается вставкой.
  if (source.photoPath !== null) {
    await updateDraftMailingPhotoPath(copyId, await copyMailingPhoto(source.photoPath, copyId));
  }

  log.info('рассылка скопирована в черновик', { mailingId, copyId, createdById });

  return readMailing(copyId);
};
