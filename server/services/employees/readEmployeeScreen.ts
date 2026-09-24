import { findEmployeeByTelegramUserId } from '#server/repositories/employees';
import { registrationScreenTexts } from '#server/services/drivers/registrationScreen';
import { readEmployeeOffices } from '#server/services/offices/employeeOffices';
import { formatPhone } from '#shared/phone';
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
 * не делает человека водителем. Отказ показывает номер учётки и Telegram ID — по ним
 * руководитель найдёт, кого включить, — и говорит текстами экранов регистрации: по устройству
 * это тот же экран исхода. Словарь двери веба (`shared/denials.ts`) здесь не читается.
 */
export const readEmployeeScreen = async (
  telegramUserId: bigint,
): Promise<MiniAppEmployeeScreen | MiniAppEmployeeDeniedScreen | null> => {
  const employee = await findEmployeeByTelegramUserId(telegramUserId);

  if (!employee) {
    return null;
  }

  if (employee.disabledAt !== null) {
    return {
      screen: 'employee_denied',
      phone: formatPhone(employee.phoneE164),
      telegramId: telegramUserId.toString(),
      texts: registrationScreenTexts(),
    };
  }

  return {
    screen: 'employee',
    fullName: employee.fullName,
    role: employee.role,
    // Только признак: хеш из сервиса наружу не уходит ни в каком виде (issue #130).
    passwordSet: employee.passwordHash !== null,
    offices: await readEmployeeOffices({ employeeId: employee.id, role: employee.role }),
  };
};
