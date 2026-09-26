import {
  UnknownOfficeEmployeeError,
  UnknownOfficeError,
} from '#server/services/offices/errors';
import { setOfficeEmployees } from '#server/services/offices/setOfficeEmployees';
import { requireDemoEditor, requireEmployeeRole } from '#server/utils/employeeAuth';
import { readUuid, requireUuidParam } from '#server/utils/query';
import { CATALOG_ROLES } from '#shared/access';
import type { OfficeEmployeesResponse } from '#shared/types/catalog';

// Кто закреплён за офисом — набором целиком. `PUT`, потому что это и есть замена набора:
// экран правит один список, и две ручки («привязать», «снять») означали бы, что вторую
// однажды забудут позвать.
//
// Пустой набор законен: у офиса может не быть ни одного сотрудника.
type EmployeesBody = {
  employeeIds?: unknown;
};

export default defineEventHandler(async (event): Promise<OfficeEmployeesResponse> => {
  const employee = await requireEmployeeRole(event, CATALOG_ROLES);

  const officeId = requireUuidParam(event, 'officeId');

  await requireDemoEditor(employee, { kind: 'office', id: officeId });

  const body = await readBody<EmployeesBody>(event);

  if (!Array.isArray(body?.employeeIds)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'нужен список employeeIds',
    });
  }

  // Идентификаторы проверяются на вид до запроса: строка, не похожая на uuid, уходит
  // в `::uuid` и роняет запрос ошибкой Postgres — это пятисотка там, где кривой запрос.
  // Список собирается проверенными значениями, а не приводится типом после проверки:
  // приведение сказало бы «я знаю лучше», ничего при этом не проверив.
  const employeeIds: string[] = [];

  for (const value of body.employeeIds) {
    const employeeId = readUuid(value);

    if (!employeeId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Bad Request',
        message: 'в списке employeeIds есть значение, не похожее на uuid',
      });
    }

    employeeIds.push(employeeId);
  }

  try {
    return await setOfficeEmployees(officeId, employeeIds);
  } catch (error) {
    if (error instanceof UnknownOfficeError) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Not Found',
        message: 'офиса с таким идентификатором нет',
      });
    }

    // 404 здесь не годится: офис нашёлся, не нашлась учётка из присланного списка.
    // Это негодное тело запроса, а не отсутствующий адрес.
    if (error instanceof UnknownOfficeEmployeeError) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Bad Request',
        message: 'в списке есть сотрудник, которого больше нет: обновите страницу',
      });
    }

    throw error;
  }
});
