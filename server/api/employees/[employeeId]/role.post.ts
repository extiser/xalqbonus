import { changeEmployeeRole } from '#server/services/employees/changeEmployeeRole';
import { isEmployeeRole } from '#server/services/employees/roles';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { STAFF_ROLES } from '#shared/access';
import type { EmployeeRoleChangeResponse } from '#shared/types/employee';

// Смена роли учётки (issue #291). Тело — новая роль. Действует со следующего запроса: роль
// читается из базы на каждом, сессии не гасятся. Повтор той же роли отвечает тем же успехом.
//
// Отказы доменного правила — строкой при ручке, как у выключения и сброса пароля
// (docs/decisions.md → «Отказ двери веба говорит кодом»).

type RoleBody = {
  role?: unknown;
};

export default defineEventHandler(async (event): Promise<EmployeeRoleChangeResponse> => {
  const employee = await requireEmployeeRole(event, STAFF_ROLES);
  const employeeId = requireUuidParam(event, 'employeeId');
  const body = await readBody<RoleBody>(event);

  if (!isEmployeeRole(body?.role)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'роль должна быть owner, admin, senior_manager или manager',
    });
  }

  const result = await changeEmployeeRole({
    actor: { employeeId: employee.employeeId, role: employee.role },
    employeeId,
    role: body.role,
  });

  if (result.outcome === 'not_found') {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: 'учётки с таким идентификатором нет',
    });
  }

  if (result.outcome === 'forbidden') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'сменить роль можно только учётке роли ниже своей и только на роль ниже своей',
    });
  }

  if (result.outcome === 'demo_account') {
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      message: 'роль демо-учётки не меняется',
    });
  }

  return { employeeId, role: result.role };
});
