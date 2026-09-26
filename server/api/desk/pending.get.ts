import { readDeskPending } from '#server/services/desk/readDeskPending';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { explainOfficeOrderFailure } from '#server/utils/officeOrderFailure';
import { readUuid } from '#server/utils/query';
import { ORDER_ROLES } from '#shared/access';
import type { DeskPendingResponse } from '#shared/types/rewards';

// «Ждут выдачи» у стойки: заказы и награды офиса одним списком — `?officeId=` (issue #250).
export default defineEventHandler(async (event): Promise<DeskPendingResponse> => {
  // Стойка открыта и демо-менеджеру (issue #205): офисы сотрудника ограничивают демо-учётку
  // ДЕМО ОФИСОМ.
  const employee = await requireEmployeeRole(event, ORDER_ROLES, { allowDemo: true });
  const officeId = readUuid(getQuery(event).officeId);

  if (!officeId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'параметр officeId не похож на uuid',
    });
  }

  try {
    return await readDeskPending(employee, officeId);
  } catch (error) {
    throw explainOfficeOrderFailure(error) ?? error;
  }
});
