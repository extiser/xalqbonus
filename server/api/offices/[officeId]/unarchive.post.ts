import { UnknownOfficeError } from '#server/services/offices/errors';
import { setOfficeArchived } from '#server/services/offices/setOfficeArchived';
import { requireDemoEditor, requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { CATALOG_ROLES } from '#shared/access';
import type { OfficeResponse } from '#shared/types/catalog';

// Возврат офиса из архива. Своей ручкой, а не флагом в теле правки: открыть закрытый офис —
// решение, и в журнале запросов оно должно быть видно отдельной строкой.
export default defineEventHandler(async (event): Promise<OfficeResponse> => {
  const employee = await requireEmployeeRole(event, CATALOG_ROLES);

  const officeId = requireUuidParam(event, 'officeId');

  await requireDemoEditor(employee, { kind: 'office', id: officeId });

  try {
    return { office: await setOfficeArchived(officeId, false) };
  } catch (error) {
    if (error instanceof UnknownOfficeError) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Not Found',
        message: 'офиса с таким идентификатором нет',
      });
    }

    throw error;
  }
});
