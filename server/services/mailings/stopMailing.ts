import { consola } from 'consola';
import { removeMailingJobs } from '#server/queues/mailing';
import {
  findMailing,
  listPendingRecipientIds,
  markMailingStopped,
} from '#server/repositories/mailings';
import {
  MailingStatusMismatchError,
  UnknownMailingError,
} from '#server/services/mailings/errors';
import { readMailing } from '#server/services/mailings/readMailing';
import type { Mailing } from '#shared/types/mailing';

/**
 * Остановка идущей рассылки.
 *
 * Решает статус, а не очередь: воркер читает его перед каждой отправкой, и задание
 * остановленной рассылки закрывается без отправки, оставляя адресата `pending`. Задания,
 * ещё ждущие в очереди, снимаются вдобавок — не ради корректности, а ради следующей
 * рассылки: четыре тысячи пустых заданий под лимитом скорости держали бы её минутами.
 * Задание, уже взятое воркером, снять нельзя; его закроет та же проверка статуса.
 *
 * Остановленная не возобновляется: продолжение — это копия в новый черновик.
 */
const log = consola.withTag('mailings:stop');

export const stopMailing = async (mailingId: string): Promise<Mailing> => {
  if (!(await markMailingStopped(mailingId))) {
    const current = await findMailing(mailingId);

    if (!current) {
      throw new UnknownMailingError(mailingId);
    }

    throw new MailingStatusMismatchError(mailingId, current.status, 'running');
  }

  const pending = await listPendingRecipientIds(mailingId);
  const removed = await removeMailingJobs(mailingId, pending);

  log.info('рассылка остановлена', { mailingId, pending: pending.length, jobsRemoved: removed });

  return readMailing(mailingId);
};
