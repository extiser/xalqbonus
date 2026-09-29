import { consola } from 'consola';

import { db } from '#server/db';
import type { EmployeeRole } from '#server/generated/prisma/enums';
import { lockEmployeeById, updateEmployeeRole } from '#server/repositories/employees';
import { canChangeRole, type EmployeeActor } from '#server/services/employees/roles';

/**
 * Смена роли учётки (issue #291): повышенного менеджера не выключают и не приглашают заново
 * второй учёткой на тот же телефон, а переводят на новую роль.
 *
 * Право — то же правило «строго ниже своей», что у приглашения и выключения, и никакое
 * другое: действующий старше и прежней, и новой роли (`canChangeRole` в `roles.ts`). Себе
 * роль не сменить, `owner` не назначить и не снять — всё это следует из рангов.
 *
 * Сессии не гасятся: роль читается из базы на каждом запросе в обеих дверях
 * (`authenticate.ts`), и новая действует со следующего запроса, без выхода из веба
 * и приложения. Закрепления за офисами (`employee_offices`) смена роли не трогает: опущенная
 * до менеджера учётка работает в тех офисах, за которыми закреплена, а без них не видит
 * ни одного заказа — как свежий менеджер.
 *
 * След — строка лога с автором, учёткой, прежней и новой ролью. Журнала действий сотрудника
 * здесь нет: он заводится отдельно (T90).
 */

const log = consola.withTag('employees:role');

// Каждый исход отдельным членом объединения — как в `resetEmployeePassword.ts`: проверка
// `outcome === ...` у ручки сужает тип.
export type ChangeEmployeeRoleResult =
  | { outcome: 'changed'; role: EmployeeRole }
  /** Учётки с таким идентификатором нет. */
  | { outcome: 'not_found' }
  /** Действующий не старше прежней или новой роли учётки. */
  | { outcome: 'forbidden' }
  /**
   * Демо-учётка (issue #205): она одна на свою роль (`employees_demo_role_key`), и под ней
   * входит демо-зритель. Смена её роли ломала бы показ.
   */
  | { outcome: 'demo_account' };

export type ChangeEmployeeRoleRequest = {
  actor: EmployeeActor;
  employeeId: string;
  role: EmployeeRole;
};

export const changeEmployeeRole = async (
  request: ChangeEmployeeRoleRequest,
): Promise<ChangeEmployeeRoleResult> =>
  db.$transaction(async (transaction) => {
    // Строка под блокировкой: право решается по прежней роли, и две одновременные смены
    // не должны решить обе по одной и той же прежней.
    const employee = await lockEmployeeById(request.employeeId, transaction);

    if (!employee) {
      return { outcome: 'not_found' };
    }

    if (!canChangeRole(request.actor.role, employee.role, request.role)) {
      return { outcome: 'forbidden' };
    }

    if (employee.isDemo) {
      return { outcome: 'demo_account' };
    }

    // Повтор той же роли — тот же успех без записи: две нажатые кнопки означают одно состояние.
    if (employee.role !== request.role) {
      await updateEmployeeRole(employee.id, request.role, transaction);

      log.info('роль сменена', {
        employeeId: employee.id,
        actorEmployeeId: request.actor.employeeId,
        fromRole: employee.role,
        toRole: request.role,
      });
    }

    return { outcome: 'changed', role: request.role };
  });
