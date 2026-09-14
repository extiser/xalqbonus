import { readMailing } from '#server/services/mailings/readMailing';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { rethrowMailingFailure } from '#server/utils/mailingFailure';
import { requireUuidParam } from '#server/utils/query';
import { MAILING_ROLES } from '#shared/access';
import type { MailingResponse } from '#shared/types/mailing';

export default defineEventHandler(async (event): Promise<MailingResponse> => {
  await requireEmployeeRole(event, MAILING_ROLES);

  const mailingId = requireUuidParam(event, 'mailingId');

  try {
    return { mailing: await readMailing(mailingId) };
  } catch (error) {
    return rethrowMailingFailure(error);
  }
});
