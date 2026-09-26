import { saveMailingPhoto } from '#server/services/mailings/saveMailingPhoto';
import { requireDemoEditor, requireEmployeeRole } from '#server/utils/employeeAuth';
import { rethrowMailingFailure } from '#server/utils/mailingFailure';
import { requireUuidParam } from '#server/utils/query';
import { MAILING_ROLES } from '#shared/access';
import type { MailingResponse } from '#shared/types/mailing';

// Фото черновика: `multipart/form-data`, одно поле с файлом — как у фото товара.
export default defineEventHandler(async (event): Promise<MailingResponse> => {
  const employee = await requireEmployeeRole(event, MAILING_ROLES);

  const mailingId = requireUuidParam(event, 'mailingId');

  await requireDemoEditor(employee, { kind: 'mailing', id: mailingId });

  const parts = await readMultipartFormData(event);
  const file = parts?.find((part) => part.filename !== undefined && part.data.byteLength > 0);

  if (!file) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'в запросе нет файла фото',
    });
  }

  try {
    return {
      mailing: await saveMailingPhoto({
        mailingId,
        contentType: (file.type ?? '').toLowerCase(),
        bytes: file.data,
      }),
    };
  } catch (error) {
    return rethrowMailingFailure(error);
  }
});
