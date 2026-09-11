import type { EmployeeRole } from '#server/generated/prisma/enums';

/**
 * Порядок ролей и правило приглашения.
 *
 * Приглашать можно роль **строго ниже своей**: `owner` — `admin` и `manager`, `admin` —
 * `manager`, `manager` — никого (docs/decisions.md → «Учётка сотрудника и роли»).
 *
 * Правило записано сравнением рангов, а не таблицей пар: с таблицей новая роль между
 * существующими требует дописать строки во все стороны, и забытая клетка становится
 * тихим расширением прав. С рангами она требует одного числа.
 *
 * «Строго ниже» отвечает сразу на два вопроса, которые иначе пришлось бы разбирать
 * отдельно: `owner` приглашением не заводится (выше него ранга нет), и админ не заводит
 * второго админа, то есть не расширяет круг равных себе.
 */

const ROLE_RANK: Readonly<Record<EmployeeRole, number>> = {
  owner: 3,
  admin: 2,
  manager: 1,
};

export const canInviteRole = (actorRole: EmployeeRole, invitedRole: EmployeeRole): boolean =>
  ROLE_RANK[actorRole] > ROLE_RANK[invitedRole];

/** Кого эта роль может пригласить. Для ответа ручки и для подсказки в интерфейсе. */
export const invitableRoles = (actorRole: EmployeeRole): EmployeeRole[] =>
  (Object.keys(ROLE_RANK) as EmployeeRole[]).filter((role) => canInviteRole(actorRole, role));

export const isEmployeeRole = (value: unknown): value is EmployeeRole =>
  typeof value === 'string' && value in ROLE_RANK;
