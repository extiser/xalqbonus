import { copyMailing } from '#server/services/mailings/copyMailing';
import { requireDemoEditor, requireEmployeeRole } from '#server/utils/employeeAuth';
import { rethrowMailingFailure } from '#server/utils/mailingFailure';
import { requireUuidParam } from '#server/utils/query';
import { MAILING_ROLES } from '#shared/access';
import type { MailingResponse } from '#shared/types/mailing';

// Копия рассылки — любой, кроме идущей, — в новый черновик. Отвечает копией: следующий шаг — её страница.
export default defineEventHandler(async (event): Promise<MailingResponse> => {
  const employee = await requireEmployeeRole(event, MAILING_ROLES);

  const mailingId = requireUuidParam(event, 'mailingId');

  await requireDemoEditor(employee, { kind: 'mailing', id: mailingId });

  try {
    return { mailing: await copyMailing(mailingId, employee.employeeId) };
  } catch (error) {
    return rethrowMailingFailure(error);
  }
});
