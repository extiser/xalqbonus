import { readOfficeCard } from '#server/services/offices/readOfficeCard';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { CATALOG_ROLES } from '#shared/access';
import type { OfficeCardResponse } from '#shared/types/catalog';

// Карточка офиса: сам офис и закреплённые сотрудники. Остатки и журнал движений идут своими
// ручками — у них своя цена и своё листание.
export default defineEventHandler(async (event): Promise<OfficeCardResponse> => {
  await requireEmployeeRole(event, CATALOG_ROLES);

  const officeId = requireUuidParam(event, 'officeId');
  const card = await readOfficeCard(officeId);

  if (!card) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: 'офиса с таким идентификатором нет',
    });
  }

  return card;
});
