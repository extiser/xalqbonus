import { listEmployeeAccounts } from '#server/repositories/employees';
import type { EmployeeAccountsResponse } from '#shared/types/employee';

/**
 * Учётки для выбора: кого закрепить за офисом.
 *
 * Экраном учёток это не становится — ни телефона, ни признаков входа здесь нет, править
 * отсюда нечего (issue #120 → «Не делать»). Выключенные учётки в списке есть и помечены:
 * сотрудник, которому закрыли доступ на время, за офисом остаётся закреплённым, и прятать
 * его значило бы терять состав офиса при первом же выключении.
 */
export const readEmployeeAccounts = async (): Promise<EmployeeAccountsResponse> => {
  const rows = await listEmployeeAccounts();

  return {
    employees: rows.map((row) => ({
      employeeId: row.id,
      fullName: row.fullName,
      role: row.role,
      disabled: row.disabledAt !== null,
    })),
  };
};
