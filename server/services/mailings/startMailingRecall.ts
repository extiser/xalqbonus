import { consola } from 'consola';
import { enqueueMailingRecall } from '#server/queues/mailing';
import {
  clearMailingRecallStarted,
  findMailing,
  listRecallableRecipientIds,
  markMailingRecallStarted,
  type MailingRow,
} from '#server/repositories/mailings';
import {
  MailingRecallUnavailableError,
  UnknownMailingError,
} from '#server/services/mailings/errors';
import { toMailing } from '#server/services/mailings/fields';
import { readMailing } from '#server/services/mailings/readMailing';
import type { MailingRecallProblem } from '#shared/mailing';
import type { Mailing } from '#shared/types/mailing';

/**
 * Запуск отзыва: сообщение рассылки удаляется у всех, кому дошло (issue #150).
 *
 * Отзывают только остановленную и завершённую: у идущей часть сообщений ещё в пути, и её
 * сначала останавливают. Окно — 48 часов от самого раннего отправленного: дальше Telegram
 * удалить не даёт.
 *
 * Отметка запуска пишется одним условным `UPDATE` до постановки заданий. Повтор нажатия
 * — вторым сотрудником или вторым кликом — упирается в заполненную отметку и заданий
 * не ставит: второй проход прислал бы второй запрос на удаление тем, у кого первый
 * не удался. Отвечает он рассылкой как есть, отказом это не является.
 *
 * Задания ставятся после отметки, а не до: иначе два нажатия поставили бы два прохода.
 * Упавшая постановка снимает отметку обратно — отзыв, который не начинался, не должен
 * гасить кнопку навсегда.
 *
 * Водителю вдогонку ничего не уходит: сообщение просто исчезает из переписки (решение
 * Руслана 15-09-2026).
 */
const log = consola.withTag('mailings:recall');

/** Почему отметка не легла — у строки, в которой отзыв ещё не запускали. */
const recallProblemOf = (row: MailingRow): MailingRecallProblem => {
  if (row.status !== 'stopped' && row.status !== 'finished') {
    return 'not_sent_yet';
  }

  return row.sent === 0 ? 'nothing_sent' : 'window_expired';
};

export const startMailingRecall = async (mailingId: string): Promise<Mailing> => {
  if (!(await markMailingRecallStarted(mailingId))) {
    const current = await findMailing(mailingId);

    if (!current) {
      throw new UnknownMailingError(mailingId);
    }

    if (current.recallStartedAt !== null) {
      return toMailing(current);
    }

    throw new MailingRecallUnavailableError(mailingId, recallProblemOf(current));
  }

  const personIds = await listRecallableRecipientIds(mailingId);

  try {
    await enqueueMailingRecall(mailingId, personIds);
  } catch (error) {
    await clearMailingRecallStarted(mailingId);

    throw error;
  }

  log.info('отзыв рассылки запущен', { mailingId, recipients: personIds.length });

  return readMailing(mailingId);
};
