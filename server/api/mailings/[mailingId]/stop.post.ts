import { stopMailing } from '#server/services/mailings/stopMailing';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { rethrowMailingFailure } from '#server/utils/mailingFailure';
import { requireUuidParam } from '#server/utils/query';
import { MAILING_ROLES } from '#shared/access';
import type { MailingResponse } from '#shared/types/mailing';

// Остановка идущей рассылки. Оставшиеся адресаты остаются `pending` и сообщения не получают.
export default defineEventHandler(async (event): Promise<MailingResponse> => {
  await requireEmployeeRole(event, MAILING_ROLES);

  const mailingId = requireUuidParam(event, 'mailingId');

  try {
    return { mailing: await stopMailing(mailingId) };
  } catch (error) {
    return rethrowMailingFailure(error);
  }
});
