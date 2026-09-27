import { readPendingInvites } from '#server/services/employees/readPendingInvites';
import { readAppOrigin } from '#server/utils/appOrigin';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { STAFF_ROLES } from '#shared/access';
import type { EmployeeInvitesResponse } from '#shared/types/employee';

// Висящие приглашения для экрана сотрудников. Ссылка — у живого и только тому, кто вправе
// её выпустить (issue #267): решает сервис.
export default defineEventHandler(async (event): Promise<EmployeeInvitesResponse> => {
  const employee = await requireEmployeeRole(event, STAFF_ROLES);

  return readPendingInvites({
    actor: { employeeId: employee.employeeId, role: employee.role },
    appOrigin: readAppOrigin(event),
  });
});
