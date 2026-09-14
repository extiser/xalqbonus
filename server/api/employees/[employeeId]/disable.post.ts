import { setEmployeeDisabled } from '#server/services/employees/setEmployeeDisabled';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { STAFF_ROLES } from '#shared/access';
import type { EmployeeDisabledResponse } from '#shared/types/employee';

// Выключение учётки. Действует немедленно: `disabled_at` проверяется на каждом запросе
// в обеих дверях. Повтор на выключенной отвечает тем же успехом и время не двигает.
export default defineEventHandler(async (event): Promise<EmployeeDisabledResponse> => {
  const employee = await requireEmployeeRole(event, STAFF_ROLES);
  const employeeId = requireUuidParam(event, 'employeeId');

  const outcome = await setEmployeeDisabled({
    actor: { employeeId: employee.employeeId, role: employee.role },
    employeeId,
    disabled: true,
  });

  if (outcome === 'not_found') {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: 'учётки с таким идентификатором нет',
    });
  }

  // Отказ доменного правила, а не двери: текст при правиле, как у отзыва приглашения
  // (docs/decisions.md → «Отказ двери веба говорит кодом»).
  if (outcome === 'forbidden') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'выключать можно только учётку роли ниже своей',
    });
  }

  return { employeeId, disabled: true };
});
