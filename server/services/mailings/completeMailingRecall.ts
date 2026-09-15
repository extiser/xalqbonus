import { consola } from 'consola';
import { markMailingRecallFinished } from '#server/repositories/mailings';

/**
 * Завершение отзыва — итоговое задание, которое очередь берёт, когда кончились задания
 * всех адресатов, удачные и нет (server/queues/mailing.ts → `enqueueMailingRecall`).
 *
 * После него на экране стоит «отозвано N из M»: пока отметки нет, число снятых — ход отзыва,
 * а не итог. Не отозванные считаются запросом — `sent`, `recalled_at` пусто, отметка
 * завершения есть, — и отдельно не хранятся.
 */
const log = consola.withTag('mailings:recall');

export type MailingRecallCompletion = 'recall_finished' | 'recall_already_finished';

export const completeMailingRecall = async (mailingId: string): Promise<MailingRecallCompletion> => {
  if (!(await markMailingRecallFinished(mailingId))) {
    return 'recall_already_finished';
  }

  log.info('отзыв рассылки завершён', { mailingId });

  return 'recall_finished';
};
