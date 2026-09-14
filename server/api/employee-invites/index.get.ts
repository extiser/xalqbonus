import { readPendingInvites } from '#server/services/employees/readPendingInvites';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { STAFF_ROLES } from '#shared/access';
import type { EmployeeInvitesResponse } from '#shared/types/employee';

// Висящие приглашения для экрана сотрудников. Ссылок в ответе нет и быть не может: в базе
// лежит только хеш токена, а ссылка показывается один раз при выпуске.
export default defineEventHandler(async (event): Promise<EmployeeInvitesResponse> => {
  const employee = await requireEmployeeRole(event, STAFF_ROLES);

  return readPendingInvites({
    actor: { employeeId: employee.employeeId, role: employee.role },
  });
});
