import { consola } from 'consola';

import { clearEmployeePassword, findEmployeeById } from '#server/repositories/employees';
import { canManageEmployee, type EmployeeActor } from '#server/services/employees/roles';

/**
 * Сброс пароля сотруднику: пароль обнуляется, выданные cookie гаснут.
 *
 * Пароль здесь не задаётся и не показывается никому: ручки «поставить пароль другому»
 * не существует и не появляется. Новый пароль сотрудник придумывает сам, в Mini App — пункт
 * задания пароля показывается ровно тогда, когда пароля нет (`#130`), и сброс возвращает
 * человека на этот экран. Знание пароля остаётся у одного человека, иначе журнал перестаёт
 * отвечать, кто именно выдал заказ (docs/decisions.md → «Пароль сотрудника: задаёт сам,
 * сбрасывает владелец»).
 *
 * Право — «роль строго ниже своей» (`roles.ts`). Себе сбросить нельзя тем же правилом:
 * свой пароль меняется на `/password`.
 *
 * Сброс у того, у кого пароля нет, ничего не пишет и отвечает успехом: кнопки на экране
 * в этом состоянии нет, а отдельный отказ на него был бы текстом, который никто не прочитает.
 */

const log = consola.withTag('employees:password');

export type ResetEmployeePasswordOutcome =
  | 'reset'
  /** Учётки с таким идентификатором нет. */
  | 'not_found'
  /** Роль учётки не ниже роли действующего. */
  | 'forbidden'
  /**
   * Telegram у учётки нет — пароль для неё единственный вход, и после сброса задать новый
   * было бы негде. База такую запись и не примет (`employees_login_present_check`).
   * По рангам недостижимо — без Telegram заводится только владелец, — но отбивается здесь,
   * а не ошибкой ограничения.
   */
  | 'no_telegram';

export type ResetEmployeePasswordRequest = {
  actor: EmployeeActor;
  employeeId: string;
  now?: Date;
};

export const resetEmployeePassword = async (
  request: ResetEmployeePasswordRequest,
): Promise<ResetEmployeePasswordOutcome> => {
  const employee = await findEmployeeById(request.employeeId);

  if (!employee) {
    return 'not_found';
  }

  if (!canManageEmployee(request.actor.role, employee.role)) {
    return 'forbidden';
  }

  if (employee.telegramUserId === null) {
    return 'no_telegram';
  }

  // Условие «пароль есть» стоит в самом `UPDATE`: без пароля строка не трогается, и отметка
  // годности сессий не двигается от нажатия, которое ничего не сбросило.
  const cleared = await clearEmployeePassword(employee.id, request.now ?? new Date());

  if (cleared) {
    log.info('пароль сброшен', {
      employeeId: employee.id,
      actorEmployeeId: request.actor.employeeId,
    });
  }

  return 'reset';
};
