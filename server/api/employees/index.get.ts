import { readEmployeeAccounts } from '#server/services/employees/readEmployeeAccounts';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { CATALOG_ROLES } from '#shared/access';
import type { EmployeeAccountsResponse } from '#shared/types/employee';

// Учётки для выбора: кого закрепить за офисом. Экраном учёток это не является — ни телефона,
// ни признаков входа в ответе нет, править отсюда нечего, а приглашения живут своей ручкой
// (issue #120 → «Не делать»).
//
// Роли те же, что у офисов: закрепление сотрудника за офисом — часть работы с офисами.
export default defineEventHandler(async (event): Promise<EmployeeAccountsResponse> => {
  await requireEmployeeRole(event, CATALOG_ROLES);

  return readEmployeeAccounts();
});
