import type { EmployeeRole } from '#server/generated/prisma/enums';

/**
 * Порядок ролей и единственное правило власти над чужой учёткой — «строго ниже своей».
 *
 * Правило одно на все действия с чужой учёткой: приглашение, отзыв приглашения, выключение
 * и включение, сброс пароля. `owner` — над `admin` и `manager`, `admin` — над `manager`,
 * `manager` — ни над кем (docs/decisions.md → «Учётка сотрудника и роли», issue #132).
 *
 * Записано одним предикатом, а через него — каждое действие: три места, сравнивающие ранги
 * самостоятельно, разойдутся на первой новой роли.
 *
 * Правило записано сравнением рангов, а не таблицей пар: с таблицей новая роль между
 * существующими требует дописать строки во все стороны, и забытая клетка становится
 * тихим расширением прав. С рангами она требует одного числа.
 *
 * «Строго ниже» отвечает сразу на вопросы, которые иначе пришлось бы разбирать отдельными
 * проверками: `owner` приглашением не заводится и никем не выключается (выше него ранга нет),
 * себя не выключить и себе не сбросить (свой ранг не ниже своего), а админ не заводит
 * и не выключает другого админа — не расширяет круг равных себе и не устраивает с ним гонку
 * «кто кого первым».
 */

/** Кто действует: то, что о нём знает проверка доступа. */
export type EmployeeActor = {
  employeeId: string;
  role: EmployeeRole;
};

const ROLE_RANK: Readonly<Record<EmployeeRole, number>> = {
  owner: 3,
  admin: 2,
  manager: 1,
};

/** Роль `otherRole` строго ниже роли `actorRole`. Единственное сравнение рангов в проекте. */
export const outranks = (actorRole: EmployeeRole, otherRole: EmployeeRole): boolean =>
  ROLE_RANK[actorRole] > ROLE_RANK[otherRole];

/** Можно ли выпустить или отозвать приглашение на эту роль. */
export const canInviteRole = (actorRole: EmployeeRole, invitedRole: EmployeeRole): boolean =>
  outranks(actorRole, invitedRole);

/** Можно ли выключить, включить учётку или сбросить ей пароль. */
export const canManageEmployee = (actorRole: EmployeeRole, employeeRole: EmployeeRole): boolean =>
  outranks(actorRole, employeeRole);

/** Кого эта роль может пригласить. Для ответа ручки и для подсказки в интерфейсе. */
export const invitableRoles = (actorRole: EmployeeRole): EmployeeRole[] =>
  (Object.keys(ROLE_RANK) as EmployeeRole[]).filter((role) => canInviteRole(actorRole, role));

export const isEmployeeRole = (value: unknown): value is EmployeeRole =>
  typeof value === 'string' && value in ROLE_RANK;
