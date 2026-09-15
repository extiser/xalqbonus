import { consola } from 'consola';
import { deleteMailingPhoto } from '#server/adapters/uploads/mailingPhotos';
import { deleteDraftMailing, findMailing } from '#server/repositories/mailings';
import {
  MailingStatusMismatchError,
  UnknownMailingError,
} from '#server/services/mailings/errors';

/**
 * Удаление черновика рассылки — вместе с файлом фото (issue #148).
 *
 * Физическое, а не отметкой: на черновик никто не ссылается по построению — снимок адресатов
 * появляется только запуском. Запущенная, остановленная и завершённая не удаляются: у них
 * снимок и исходы, и это журнал того, что ушло водителям.
 *
 * Порядок — сначала строка, потом файл, как у снятия фото: обратный дал бы черновик
 * со ссылкой на файл, которого нет. Упавшее удаление файла удаление не отменяет — черновика
 * уже нет, а оставшийся файл — мусор на томе, а не поломка.
 *
 * Брошенные черновики сами не чистятся: человек может вернуться к недописанному через неделю,
 * и запись, исчезнувшая по возрасту, выглядит как потеря работы.
 */
const log = consola.withTag('mailings:delete');

export const deleteMailingDraft = async (mailingId: string): Promise<void> => {
  const deleted = await deleteDraftMailing(mailingId);

  if (!deleted) {
    const current = await findMailing(mailingId);

    if (!current) {
      throw new UnknownMailingError(mailingId);
    }

    throw new MailingStatusMismatchError(mailingId, current.status, 'draft');
  }

  if (deleted.photoPath !== null) {
    try {
      await deleteMailingPhoto(deleted.photoPath);
    } catch (error) {
      log.warn('черновик рассылки удалён, но файл фото с тома не удалился', {
        mailingId,
        photoPath: deleted.photoPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  log.info('черновик рассылки удалён', { mailingId, photoPath: deleted.photoPath });
};
