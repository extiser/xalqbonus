import { listLiveAccessLinks } from '#server/repositories/employeeAccessLinks';
import { listEmployeeDirectory } from '#server/repositories/employees';
import { buildSetPasswordLink } from '#server/services/employees/employeeLinks';
import { buildLiveTelegramLink, canIssueTelegramLink } from '#server/services/employees/telegramLink';
import {
  canChangeRole,
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
 * Выключенные учётки в списке есть и помечены: их включают обратно с этого же экрана. Офисов
 * у выключенной нет — выключение снимает со всех (issue #291); экран по умолчанию её прячет.
 *
 * Демо-сотрудник помечен и правится только владельцем (issue #212): у остальных он
 * не `manageable`, хоть роль его и ниже. Ручки решают то же сами — `requireDemoEditor`.
 *
 * На какие роли можно перевести учётку, приезжает списком `assignableRoles` (issue #291) — тем же
 * правилом, что решает ручка смены роли. У демо-учётки он пуст: её роль не меняется.
 *
 * Живая ссылка «задать пароль» приезжает только к `manageable` учётке (issue #267): ссылкой
 * задают пароль и входят под этой учёткой, и видеть её вправе тот, кто вправе её выпустить.
 * Ссылка привязки Telegram — по тому же правилу, и ещё к своей строке: себе её выпускает каждый.
 * Привязан ли Telegram, видят все, кто видит список: руководитель должен знать, дошло ли дело.
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
  const now = request.now ?? new Date();
  const [rows, passwordLinks, telegramLinks] = await Promise.all([
    listEmployeeDirectory(),
    listLiveAccessLinks('password', now),
    listLiveAccessLinks('telegram', now),
  ]);
  const passwordLinkByEmployee = new Map(passwordLinks.map((link) => [link.employeeId, link]));
  const telegramLinkByEmployee = new Map(telegramLinks.map((link) => [link.employeeId, link]));

  const actorInvitableRoles = invitableRoles(request.actor.role);

  const accounts = rows.map(async (row) => {
      const manageable =
        canManageEmployee(request.actor.role, row.role) && canEditDemo(request.actor.role, row.isDemo);
      const passwordLink = manageable ? passwordLinkByEmployee.get(row.id) : undefined;
      // Демо-учётке ссылка не выпускается вовсе (`demo_account`), и кнопки у неё нет.
      const telegramLinkIssuable =
        !row.isDemo &&
        canIssueTelegramLink(request.actor, { employeeId: row.id, role: row.role, isDemo: row.isDemo });
      const telegramLink =
        telegramLinkIssuable && !row.telegramBound ? telegramLinkByEmployee.get(row.id) : undefined;
      const telegramUrl = telegramLink ? await buildLiveTelegramLink(telegramLink.token) : null;

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
        telegramBound: row.telegramBound,
        telegramLinkIssuable,
        telegramLink:
          telegramLink && telegramUrl !== null
            ? { link: telegramUrl, expiresAt: telegramLink.expiresAt.toISOString() }
            : null,
        offices: row.offices,
        anyOffice: ANY_OFFICE_ROLES.includes(row.role),
        isDemo: row.isDemo,
        manageable,
        assignableRoles:
          manageable && !row.isDemo
            ? actorInvitableRoles.filter(
                (role) => role !== row.role && canChangeRole(request.actor.role, row.role, role),
              )
            : [],
      };
    });

  return {
    employees: await Promise.all(accounts),
    invitableRoles: actorInvitableRoles,
  };
};
