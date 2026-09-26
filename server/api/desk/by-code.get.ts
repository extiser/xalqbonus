import { findDeskItemByCode } from '#server/services/desk/findDeskItemByCode';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { explainOfficeOrderFailure } from '#server/utils/officeOrderFailure';
import { readUuid } from '#server/utils/query';
import { ORDER_ROLES } from '#shared/access';
import type { DeskItemResponse } from '#shared/types/rewards';

// Что ждёт выдачи по коду в офисе — заказ или награда: `?officeId=&code=`. Поле кода у стойки
// одно, и ответ размечен `kind` (issue #172). Не нашлось — `404` без уточнений, код в чужом
// офисе — тоже.
export default defineEventHandler(async (event): Promise<DeskItemResponse> => {
  // Стойка открыта и демо-менеджеру (issue #205): ручку зовёт экран сотрудника в Mini App,
  // а офисы сотрудника ограничивают демо-учётку ДЕМО ОФИСОМ.
  const employee = await requireEmployeeRole(event, ORDER_ROLES, { allowDemo: true });
  const query = getQuery(event);
  const officeId = readUuid(query.officeId);

  if (!officeId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'параметр officeId не похож на uuid',
    });
  }

  const code = typeof query.code === 'string' ? query.code.trim() : '';

  try {
    return await findDeskItemByCode(employee, officeId, code);
  } catch (error) {
    throw explainOfficeOrderFailure(error) ?? error;
  }
});
