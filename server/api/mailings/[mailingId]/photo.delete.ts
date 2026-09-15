import { removeMailingPhoto } from '#server/services/mailings/removeMailingPhoto';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { rethrowMailingFailure } from '#server/utils/mailingFailure';
import { requireUuidParam } from '#server/utils/query';
import { MAILING_ROLES } from '#shared/access';
import type { MailingResponse } from '#shared/types/mailing';

// Снятие фото с черновика — по образцу ручки, которая его кладёт: тот же доступ и та же
// проверка статуса. Запущенная рассылка отвечает `409`, черновик без фото — собой.
export default defineEventHandler(async (event): Promise<MailingResponse> => {
  await requireEmployeeRole(event, MAILING_ROLES);

  const mailingId = requireUuidParam(event, 'mailingId');

  try {
    return { mailing: await removeMailingPhoto(mailingId) };
  } catch (error) {
    return rethrowMailingFailure(error);
  }
});
