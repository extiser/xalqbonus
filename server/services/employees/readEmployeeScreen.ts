import { findEmployeeByTelegramUserId } from '#server/repositories/employees';
import { readEmployeeOffices } from '#server/services/offices/employeeOffices';
import { denialText, WEB_LANGUAGE } from '#shared/denials';
import type { MiniAppEmployeeDeniedScreen, MiniAppEmployeeScreen } from '#shared/types/miniapp';

/**
 * Экран сотрудника в Mini App — или `null`, если этот Telegram сотруднику не принадлежит.
 *
 * Спрашивается первым, до водительской привязки: сотрудник, открывший приложение, водительский
 * экран не видит никогда (T25). Одновременно водителем и сотрудником быть нельзя — правило
 * держится при принятии приглашения и при привязке водителя, — поэтому порядок проверок
 * ничего не выбирает, а только экономит запрос водителю.
 *
 * Выключенная учётка — тоже экран сотрудника, с отказом: роль у Telegram одна, и выключение
 * не делает человека водителем.
 */
export const readEmployeeScreen = async (
  telegramUserId: bigint,
): Promise<MiniAppEmployeeScreen | MiniAppEmployeeDeniedScreen | null> => {
  const employee = await findEmployeeByTelegramUserId(telegramUserId);

  if (!employee) {
    return null;
  }

  if (employee.disabledAt !== null) {
    return { screen: 'employee_denied', message: denialText('disabled', WEB_LANGUAGE) };
  }

  return {
    screen: 'employee',
    fullName: employee.fullName,
    role: employee.role,
    offices: await readEmployeeOffices({ employeeId: employee.id, role: employee.role }),
  };
};
