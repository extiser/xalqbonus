import { resetEmployeePassword } from '#server/services/employees/resetEmployeePassword';
import { requireDemoEditor, requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { STAFF_ROLES } from '#shared/access';
import type { EmployeePasswordResetResponse } from '#shared/types/employee';

// Сброс пароля сотруднику. Тела у запроса нет: пароль здесь не задаётся — ручки «поставить
// пароль другому» не существует, новый пароль сотрудник задаёт себе сам в Mini App.
export default defineEventHandler(async (event): Promise<EmployeePasswordResetResponse> => {
  const employee = await requireEmployeeRole(event, STAFF_ROLES);
  const employeeId = requireUuidParam(event, 'employeeId');

  await requireDemoEditor(employee, { kind: 'employee', id: employeeId });

  const outcome = await resetEmployeePassword({
    actor: { employeeId: employee.employeeId, role: employee.role },
    employeeId,
  });

  if (outcome === 'not_found') {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: 'учётки с таким идентификатором нет',
    });
  }

  if (outcome === 'forbidden') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'сбрасывать пароль можно только учётке роли ниже своей; свой меняется на /password',
    });
  }

  if (outcome === 'no_telegram') {
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      message: 'у учётки нет Telegram: без пароля в неё не войти ниоткуда',
    });
  }

  return { employeeId, passwordReset: true };
});
