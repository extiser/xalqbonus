import { readMailingList } from '#server/services/mailings/readMailing';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { MAILING_ROLES } from '#shared/access';
import type { MailingListResponse } from '#shared/types/mailing';

// Список рассылок со счётчиками исходов. Менеджер получает отказ двери `role_not_allowed`.
export default defineEventHandler(async (event): Promise<MailingListResponse> => {
  await requireEmployeeRole(event, MAILING_ROLES);

  return { mailings: await readMailingList() };
});
