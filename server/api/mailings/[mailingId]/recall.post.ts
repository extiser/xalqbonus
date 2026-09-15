import { startMailingRecall } from '#server/services/mailings/startMailingRecall';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { rethrowMailingFailure } from '#server/utils/mailingFailure';
import { requireUuidParam } from '#server/utils/query';
import { MAILING_ROLES } from '#shared/access';
import type { MailingResponse } from '#shared/types/mailing';

// Отзыв отправленного: сообщение удаляется у водителей очередью рассылок. Повтор для уже
// запущенного отзыва заданий не ставит и отвечает рассылкой как есть.
export default defineEventHandler(async (event): Promise<MailingResponse> => {
  await requireEmployeeRole(event, MAILING_ROLES);

  const mailingId = requireUuidParam(event, 'mailingId');

  try {
    return { mailing: await startMailingRecall(mailingId) };
  } catch (error) {
    return rethrowMailingFailure(error);
  }
});
