import { readMailingFields, type MailingRequestFields } from '#server/services/mailings/fields';
import { updateMailing } from '#server/services/mailings/updateMailing';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { rethrowMailingFailure } from '#server/utils/mailingFailure';
import { requireUuidParam } from '#server/utils/query';
import { MAILING_ROLES } from '#shared/access';
import type { MailingResponse } from '#shared/types/mailing';

// Правка черновика целиком. Запущенная рассылка отвечает `409`.
export default defineEventHandler(async (event): Promise<MailingResponse> => {
  await requireEmployeeRole(event, MAILING_ROLES);

  const mailingId = requireUuidParam(event, 'mailingId');

  try {
    const fields = readMailingFields(await readBody<MailingRequestFields>(event));

    if (!fields) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Bad Request',
        message: 'нужны заголовок и русский текст',
      });
    }

    return { mailing: await updateMailing(mailingId, fields) };
  } catch (error) {
    return rethrowMailingFailure(error);
  }
});
