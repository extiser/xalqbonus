import { readOfficeCandidates } from '#server/services/offices/readOfficeCandidates';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { CATALOG_ROLES } from '#shared/access';
import type { OfficeEmployeeCandidatesResponse } from '#shared/types/catalog';

// Кого можно закрепить за офисом (issue #291) — тем же ролям, что закрепляют: имя и роль
// действующих сотрудников стороны офиса, без телефонов и признаков входа.
export default defineEventHandler(async (event): Promise<OfficeEmployeeCandidatesResponse> => {
  await requireEmployeeRole(event, CATALOG_ROLES);

  const officeId = requireUuidParam(event, 'officeId');
  const result = await readOfficeCandidates(officeId);

  if (!result) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: 'офиса с таким идентификатором нет',
    });
  }

  return result;
});
