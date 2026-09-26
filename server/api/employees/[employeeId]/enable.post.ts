import { setEmployeeDisabled } from '#server/services/employees/setEmployeeDisabled';
import { requireDemoEditor, requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { STAFF_ROLES } from '#shared/access';
import type { EmployeeDisabledResponse } from '#shared/types/employee';

// Включение учётки. Выданные до выключения cookie снова работают: выключение сессий
// не гасило, и возвращать человека через форму входа незачем.
export default defineEventHandler(async (event): Promise<EmployeeDisabledResponse> => {
  const employee = await requireEmployeeRole(event, STAFF_ROLES);
  const employeeId = requireUuidParam(event, 'employeeId');

  await requireDemoEditor(employee, { kind: 'employee', id: employeeId });

  const outcome = await setEmployeeDisabled({
    actor: { employeeId: employee.employeeId, role: employee.role },
    employeeId,
    disabled: false,
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
      message: 'включать можно только учётку роли ниже своей',
    });
  }

  return { employeeId, disabled: false };
});
