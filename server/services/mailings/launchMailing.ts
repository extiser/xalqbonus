import { consola } from 'consola';
import { db } from '#server/db';
import { enqueueMailingRecipients } from '#server/queues/mailing';
import {
  findMailing,
  finishMailingIfDone,
  insertMailingRecipients,
  listPendingRecipientIds,
  markMailingRunning,
} from '#server/repositories/mailings';
import {
  MailingAudienceEmptyError,
  MailingStatusMismatchError,
  UnknownMailingError,
} from '#server/services/mailings/errors';
import { assertMailingLaunchable } from '#server/services/mailings/fields';
import { readMailing } from '#server/services/mailings/readMailing';
import type { Mailing } from '#shared/types/mailing';

/**
 * Запуск рассылки: снимок адресатов и задания в очередь.
 *
 * Смена статуса и снимок — одна транзакция. Рассылка в статусе «идёт» без снимка означала бы
 * рассылку, которой некому уходить и которую нельзя ни запустить заново, ни честно посчитать.
 * Пустой снимок откатывает и статус: рассылать некому, и это не отправка.
 *
 * Заголовок, текст хотя бы на одном языке и предел длины проверяются здесь и только здесь: это
 * условия запуска, а не сохранения — черновик без них сохраняется, а уходить не должен
 * (issue #136, #148). Та же полнота стоит проверкой в базе: не черновик без текста
 * не записывается.
 *
 * Задания ставятся после фиксации, а не внутри: Redis в транзакцию базы не входит, и задание,
 * поставленное до фиксации, воркер мог бы взять раньше, чем появится строка снимка.
 * Упавшая постановка оставляет адресатов `pending` — и повтор запуска её доделывает:
 * для идущей рассылки он ставит задания ждущим снова, а `jobId` из пары
 * «рассылка + человек» и условие «ещё `pending`» при записи исхода не дают отправить дважды.
 */
const log = consola.withTag('mailings:launch');

export const launchMailing = async (mailingId: string): Promise<Mailing> => {
  const current = await findMailing(mailingId);

  if (!current) {
    throw new UnknownMailingError(mailingId);
  }

  if (current.status === 'draft') {
    assertMailingLaunchable(current);

    const snapshot = await db.$transaction(async (transaction) => {
      if (!(await markMailingRunning(mailingId, transaction))) {
        return null;
      }

      const recipients = await insertMailingRecipients(mailingId, transaction);

      if (recipients === 0) {
        throw new MailingAudienceEmptyError(mailingId);
      }

      return recipients;
    });

    // Запустили между чтением и транзакцией — вторым нажатием или вторым сотрудником.
    // Снимок уже снят тем запуском; этот доставит задания так же, как повтор ниже.
    if (snapshot !== null) {
      log.info('рассылка запущена, снимок снят', { mailingId, recipients: snapshot });
    }
  } else if (current.status !== 'running') {
    throw new MailingStatusMismatchError(mailingId, current.status, 'draft');
  }

  const pending = await listPendingRecipientIds(mailingId);

  await enqueueMailingRecipients(mailingId, pending);

  // Снимок из одних выключивших уведомления: ждать нечего, рассылка кончилась сразу.
  if (pending.length === 0) {
    await finishMailingIfDone(mailingId);
  }

  log.info('задания рассылки поставлены', { mailingId, jobs: pending.length });

  return readMailing(mailingId);
};
