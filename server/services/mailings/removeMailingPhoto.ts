import { consola } from 'consola';
import { deleteMailingPhoto } from '#server/adapters/uploads/mailingPhotos';
import { clearDraftMailingPhotoPath, findMailing } from '#server/repositories/mailings';
import {
  MailingStatusMismatchError,
  UnknownMailingError,
} from '#server/services/mailings/errors';
import { readMailing } from '#server/services/mailings/readMailing';
import type { Mailing } from '#shared/types/mailing';

/**
 * Снятие фото с черновика: колонка обнуляется, файл уходит с тома. Фото к рассылке
 * выбирают не с первого раза, и черновик с не той картинкой не должен чиниться
 * пересозданием рассылки.
 *
 * Порядок обратный загрузке — сначала колонка, потом файл: обратный дал бы черновик
 * со ссылкой на файл, которого нет. Упавшее удаление файла снятие не отменяет — фото
 * с рассылки уже снято, а оставшийся файл — мусор на томе, а не поломка.
 *
 * Черновик без фото отвечает тем же, что после снятия: снимать нечего, и повтор нажатия
 * отказом не является.
 */
const log = consola.withTag('mailings:photo');

export const removeMailingPhoto = async (mailingId: string): Promise<Mailing> => {
  const current = await findMailing(mailingId);

  if (!current) {
    throw new UnknownMailingError(mailingId);
  }

  if (current.status !== 'draft') {
    throw new MailingStatusMismatchError(mailingId, current.status, 'draft');
  }

  if (current.photoPath === null) {
    return readMailing(mailingId);
  }

  // Условие «ещё черновик» стоит в самом `UPDATE`: между чтением выше и записью рассылку
  // мог запустить второй сотрудник, и тогда файл остаётся — он уходит адресатам.
  if (!(await clearDraftMailingPhotoPath(mailingId))) {
    throw new MailingStatusMismatchError(mailingId, 'running', 'draft');
  }

  try {
    await deleteMailingPhoto(current.photoPath);
  } catch (error) {
    log.warn('фото снято с рассылки, но файл с тома не удалился', {
      mailingId,
      photoPath: current.photoPath,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  log.info('фото рассылки снято', { mailingId, photoPath: current.photoPath });

  return readMailing(mailingId);
};
