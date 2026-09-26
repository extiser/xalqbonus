import { listEmployeeDirectory } from '#server/repositories/employees';
import {
  canManageEmployee,
  invitableRoles,
  type EmployeeActor,
} from '#server/services/employees/roles';
import type { EmployeeAccountsResponse } from '#shared/types/employee';
// Относительным путём, а не через `#shared`: значение, а не тип, и модуль читают тесты,
// у которых из псевдонимов настроен один `#server` — как в `offices/employeeOffices.ts`.
import { ANY_OFFICE_ROLES, canEditDemo } from '../../../shared/access';

/**
 * Учётки парка — экран сотрудников и выбор на странице офиса.
 *
 * Права смотрящего приезжают признаками, решёнными здесь, а не условиями в разметке:
 * над какой учёткой можно действовать — `canManageEmployee`, кого можно пригласить —
 * `invitableRoles`, в каком офисе работает роль — `ANY_OFFICE_ROLES`. Решает всё равно
 * ручка действия; признак нужен, чтобы человек не нажимал то, что ему откажут, и чтобы
 * списки ролей не повторялись вторым экземпляром на клиенте.
 *
 * Выключенные учётки в списке есть и помечены: сотрудник, которому закрыли доступ на время,
 * за офисом остаётся закреплённым, и прятать его значило бы терять состав офиса при первом
 * же выключении.
 *
 * Демо-сотрудник помечен и правится только владельцем (issue #212): у остальных он
 * не `manageable`, хоть роль его и ниже. Ручки решают то же сами — `requireDemoEditor`.
 */
export type ReadEmployeeAccountsRequest = {
  actor: EmployeeActor;
};

export const readEmployeeAccounts = async (
  request: ReadEmployeeAccountsRequest,
): Promise<EmployeeAccountsResponse> => {
  const rows = await listEmployeeDirectory();

  return {
    employees: rows.map((row) => ({
      employeeId: row.id,
      fullName: row.fullName,
      role: row.role,
      phoneE164: row.phoneE164,
      disabled: row.disabledAt !== null,
      passwordSet: row.passwordSet,
      offices: row.offices,
      anyOffice: ANY_OFFICE_ROLES.includes(row.role),
      isDemo: row.isDemo,
      manageable:
        canManageEmployee(request.actor.role, row.role) && canEditDemo(request.actor.role, row.isDemo),
    })),
    invitableRoles: invitableRoles(request.actor.role),
  };
};
