import { listLiveAccessLinks } from '#server/repositories/employeeAccessLinks';
import { listEmployeeDirectory } from '#server/repositories/employees';
import { buildSetPasswordLink } from '#server/services/employees/employeeLinks';
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
 *
 * Живая ссылка «задать пароль» приезжает только к `manageable` учётке (issue #267): ссылкой
 * задают пароль и входят под этой учёткой, и видеть её вправе тот, кто вправе её выпустить.
 */
export type ReadEmployeeAccountsRequest = {
  actor: EmployeeActor;
  /** Схема и хост приложения — из запроса: ссылка «задать пароль» ведёт туда же. */
  appOrigin: string;
  now?: Date;
};

export const readEmployeeAccounts = async (
  request: ReadEmployeeAccountsRequest,
): Promise<EmployeeAccountsResponse> => {
  const [rows, passwordLinks] = await Promise.all([
    listEmployeeDirectory(),
    listLiveAccessLinks('password', request.now ?? new Date()),
  ]);
  const passwordLinkByEmployee = new Map(passwordLinks.map((link) => [link.employeeId, link]));

  return {
    employees: rows.map((row) => {
      const manageable =
        canManageEmployee(request.actor.role, row.role) && canEditDemo(request.actor.role, row.isDemo);
      const passwordLink = manageable ? passwordLinkByEmployee.get(row.id) : undefined;

      return {
        employeeId: row.id,
        fullName: row.fullName,
        role: row.role,
        phoneE164: row.phoneE164,
        disabled: row.disabledAt !== null,
        passwordSet: row.passwordSet,
        passwordLink: passwordLink
          ? {
              link: buildSetPasswordLink(request.appOrigin, passwordLink.token),
              expiresAt: passwordLink.expiresAt.toISOString(),
            }
          : null,
        offices: row.offices,
        anyOffice: ANY_OFFICE_ROLES.includes(row.role),
        isDemo: row.isDemo,
        manageable,
      };
    }),
    invitableRoles: invitableRoles(request.actor.role),
  };
};
