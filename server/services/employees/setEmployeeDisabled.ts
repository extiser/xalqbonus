import { consola } from 'consola';

import { findEmployeeById, updateEmployeeDisabled } from '#server/repositories/employees';
import { canManageEmployee, type EmployeeActor } from '#server/services/employees/roles';

/**
 * Выключение и включение учётки сотрудника — одна операция с двумя направлениями,
 * как архив офиса: всё, кроме направления, у них общее.
 *
 * Право — «роль строго ниже своей», то же, что у приглашения (`roles.ts`). Отдельных
 * проверок «себя нельзя» и «владельца нельзя» нет: обе следуют из рангов.
 *
 * Сессии здесь не гасятся: `disabled_at` проверяется на каждом запросе в обеих дверях
 * и выбрасывает человека немедленно (`authenticate.ts`). Сдвиг `sessions_valid_from`
 * был бы второй вещью, делающей то же самое, — и заодно ломал бы включение: включённый
 * человек выходил бы из веба, хотя его никто об этом не просил.
 */

const log = consola.withTag('employees:disable');

export type SetEmployeeDisabledOutcome =
  | 'updated'
  /** Учётки с таким идентификатором нет. */
  | 'not_found'
  /** Роль учётки не ниже роли действующего. */
  | 'forbidden';

export type SetEmployeeDisabledRequest = {
  actor: EmployeeActor;
  employeeId: string;
  disabled: boolean;
  now?: Date;
};

export const setEmployeeDisabled = async (
  request: SetEmployeeDisabledRequest,
): Promise<SetEmployeeDisabledOutcome> => {
  const employee = await findEmployeeById(request.employeeId);

  if (!employee) {
    return 'not_found';
  }

  if (!canManageEmployee(request.actor.role, employee.role)) {
    return 'forbidden';
  }

  await updateEmployeeDisabled(employee.id, request.disabled ? (request.now ?? new Date()) : null);

  log.info(request.disabled ? 'учётка выключена' : 'учётка включена', {
    employeeId: employee.id,
    actorEmployeeId: request.actor.employeeId,
  });

  return 'updated';
};
