import { readMailingFields, type MailingRequestFields } from '#server/services/mailings/fields';
import { updateMailing } from '#server/services/mailings/updateMailing';
import { requireDemoEditor, requireEmployeeRole } from '#server/utils/employeeAuth';
import { rethrowMailingFailure } from '#server/utils/mailingFailure';
import { requireUuidParam } from '#server/utils/query';
import { MAILING_ROLES } from '#shared/access';
import type { MailingResponse } from '#shared/types/mailing';

// Правка черновика целиком — ей сохраняет себя форма по мере набора. Пустые поля допустимы:
// чего не хватает, решает запуск. Запущенная рассылка отвечает `409`.
export default defineEventHandler(async (event): Promise<MailingResponse> => {
  const employee = await requireEmployeeRole(event, MAILING_ROLES);

  const mailingId = requireUuidParam(event, 'mailingId');

  await requireDemoEditor(employee, { kind: 'mailing', id: mailingId });

  try {
    const fields = readMailingFields(await readBody<MailingRequestFields | null>(event));

    return { mailing: await updateMailing(mailingId, fields) };
  } catch (error) {
    return rethrowMailingFailure(error);
  }
});
