import { createMailing } from '#server/services/mailings/createMailing';
import { readMailingFields, type MailingRequestFields } from '#server/services/mailings/fields';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { rethrowMailingFailure } from '#server/utils/mailingFailure';
import { MAILING_ROLES } from '#shared/access';
import type { MailingResponse } from '#shared/types/mailing';

// Заведение черновика рассылки. Без фото: фото — файл и приезжает своим запросом.
export default defineEventHandler(async (event): Promise<MailingResponse> => {
  const employee = await requireEmployeeRole(event, MAILING_ROLES);

  try {
    const fields = readMailingFields(await readBody<MailingRequestFields>(event));

    if (!fields) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Bad Request',
        message: 'нужны заголовок и русский текст',
      });
    }

    return { mailing: await createMailing(fields, employee.employeeId) };
  } catch (error) {
    return rethrowMailingFailure(error);
  }
});
