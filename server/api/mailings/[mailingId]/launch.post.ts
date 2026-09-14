import { launchMailing } from '#server/services/mailings/launchMailing';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { rethrowMailingFailure } from '#server/utils/mailingFailure';
import { requireUuidParam } from '#server/utils/query';
import { MAILING_ROLES } from '#shared/access';
import type { MailingResponse } from '#shared/types/mailing';

// Запуск: снимок адресатов и задания в очередь. Повтор для идущей рассылки доставляет
// задания ждущим адресатам и второго снимка не снимает.
export default defineEventHandler(async (event): Promise<MailingResponse> => {
  await requireEmployeeRole(event, MAILING_ROLES);

  const mailingId = requireUuidParam(event, 'mailingId');

  try {
    return { mailing: await launchMailing(mailingId) };
  } catch (error) {
    return rethrowMailingFailure(error);
  }
});
