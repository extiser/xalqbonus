import { deleteMailingDraft } from '#server/services/mailings/deleteMailingDraft';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { rethrowMailingFailure } from '#server/utils/mailingFailure';
import { requireUuidParam } from '#server/utils/query';
import { MAILING_ROLES } from '#shared/access';

// Удаление черновика вместе с фото. Не черновик отвечает `409`. Удалённому отвечать нечем —
// ответ пустой, `204`.
export default defineEventHandler(async (event): Promise<null> => {
  await requireEmployeeRole(event, MAILING_ROLES);

  const mailingId = requireUuidParam(event, 'mailingId');

  try {
    await deleteMailingDraft(mailingId);
  } catch (error) {
    return rethrowMailingFailure(error);
  }

  setResponseStatus(event, 204);

  return null;
});
