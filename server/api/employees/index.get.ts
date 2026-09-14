import { readEmployeeAccounts } from '#server/services/employees/readEmployeeAccounts';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { STAFF_ROLES } from '#shared/access';
import type { EmployeeAccountsResponse } from '#shared/types/employee';

// Учётки парка: экран сотрудников и выбор на странице офиса (issue #120, #132).
//
// Менеджеру отказ двери `role_not_allowed`: телефоны и состояние учёток коллег — материал
// того, кто ими управляет, а не того, кто выдаёт заказы.
export default defineEventHandler(async (event): Promise<EmployeeAccountsResponse> => {
  const employee = await requireEmployeeRole(event, STAFF_ROLES);

  return readEmployeeAccounts({
    actor: { employeeId: employee.employeeId, role: employee.role },
  });
});
