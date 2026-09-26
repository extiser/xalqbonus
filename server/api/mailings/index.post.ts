import { createMailing } from '#server/services/mailings/createMailing';
import { readMailingFields, type MailingRequestFields } from '#server/services/mailings/fields';
import { requireDemoEditor, requireEmployeeRole } from '#server/utils/employeeAuth';
import { rethrowMailingFailure } from '#server/utils/mailingFailure';
import { MAILING_ROLES } from '#shared/access';
import type { MailingResponse } from '#shared/types/mailing';

// Заведение черновика рассылки — первым набранным символом формы, поэтому обязательных полей
// нет (issue #148). Без фото: фото — файл и приезжает своим запросом к уже заведённому черновику.
// Демо-рассылку заводит только владелец (issue #212).
export default defineEventHandler(async (event): Promise<MailingResponse> => {
  const employee = await requireEmployeeRole(event, MAILING_ROLES);

  const body = await readBody<MailingRequestFields | null>(event);
  const isDemo = body?.isDemo === true;

  await requireDemoEditor(employee, isDemo);

  try {
    const fields = readMailingFields(body);

    return { mailing: await createMailing(fields, employee.employeeId, isDemo) };
  } catch (error) {
    return rethrowMailingFailure(error);
  }
});
