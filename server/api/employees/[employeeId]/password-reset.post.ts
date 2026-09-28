import { resetEmployeePassword } from '#server/services/employees/resetEmployeePassword';
import { readAppOrigin } from '#server/utils/appOrigin';
import { requireDemoEditor, requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { STAFF_ROLES } from '#shared/access';
import type { EmployeePasswordResetResponse } from '#shared/types/employee';

// Сброс пароля сотруднику. Тела у запроса нет: пароль здесь не задаётся — ручки «поставить
// пароль другому» не существует. Ответ — ссылка «задать пароль» (issue #267): её пересылают
// сотруднику, и новый пароль он задаёт сам.
export default defineEventHandler(async (event): Promise<EmployeePasswordResetResponse> => {
  const employee = await requireEmployeeRole(event, STAFF_ROLES);
  const employeeId = requireUuidParam(event, 'employeeId');

  await requireDemoEditor(employee, { kind: 'employee', id: employeeId });

  const result = await resetEmployeePassword({
    actor: { employeeId: employee.employeeId, role: employee.role },
    employeeId,
    appOrigin: readAppOrigin(event),
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
      message: 'сбрасывать пароль можно только учётке роли ниже своей; свой меняется на /password',
    });
  }

  if (result.outcome === 'demo_account') {
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      message: 'у демо-учётки пароля нет',
    });
  }

  return { employeeId, link: result.link, expiresAt: result.expiresAt.toISOString() };
});
