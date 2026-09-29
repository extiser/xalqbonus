import type { EmployeeRole } from '#server/generated/prisma/enums';
// Относительным путём, а не через `#shared`: значение, а не тип, и модуль читают тесты,
// у которых из псевдонимов настроен один `#server` — как в `offices/employeeOffices.ts`.
import { STAFF_ROLES } from '../../../shared/access';

/**
 * Порядок ролей и единственное правило власти над чужой учёткой — «строго ниже своей».
 *
 * Правило одно на все действия с чужой учёткой: приглашение, отзыв приглашения, выключение
 * и включение, сброс пароля, смена роли. `owner` — над `admin`, `senior_manager` и `manager`,
 * `admin` — над `senior_manager` и `manager`, `senior_manager` и `manager` — ни над кем
 * (docs/decisions.md → «Учётка сотрудника и роли», «Старший менеджер; правка баллов и выдача
 * наград руками — не менеджеру», issue #132, #291).
 *
 * Ранг `senior_manager` выше `manager`, но власти над учётками не даёт: власть — у ролей
 * экрана сотрудников (`STAFF_ROLES`), и только над рангом строго ниже. Без этой оговорки
 * старший менеджер приглашал бы менеджеров ручкой, открытой любой роли, хотя экран
 * сотрудников ему закрыт. Оговорка стоит здесь, а не у каждой ручки: ручка, забывшая её,
 * тихо расширила бы права.
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
  owner: 4,
  admin: 3,
  senior_manager: 2,
  manager: 1,
};

/** Роль `otherRole` строго ниже роли `actorRole`. Единственное сравнение рангов в проекте. */
export const outranks = (actorRole: EmployeeRole, otherRole: EmployeeRole): boolean =>
  ROLE_RANK[actorRole] > ROLE_RANK[otherRole];

/** Власть над чужой учёткой: роль экрана сотрудников и ранг строго ниже. */
const governs = (actorRole: EmployeeRole, otherRole: EmployeeRole): boolean =>
  STAFF_ROLES.includes(actorRole) && outranks(actorRole, otherRole);

/** Можно ли выпустить или отозвать приглашение на эту роль. */
export const canInviteRole = (actorRole: EmployeeRole, invitedRole: EmployeeRole): boolean =>
  governs(actorRole, invitedRole);

/** Можно ли выключить, включить учётку, сбросить ей пароль или сменить роль. */
export const canManageEmployee = (actorRole: EmployeeRole, employeeRole: EmployeeRole): boolean =>
  governs(actorRole, employeeRole);

/**
 * Можно ли перевести учётку с роли `fromRole` на `toRole`: действующий старше и прежней,
 * и новой. Отсюда без отдельных проверок: себе роль не сменить, `owner` не назначить и не снять,
 * а админ не делает никого админом и не трогает другого админа.
 */
export const canChangeRole = (
  actorRole: EmployeeRole,
  fromRole: EmployeeRole,
  toRole: EmployeeRole,
): boolean => governs(actorRole, fromRole) && governs(actorRole, toRole);

/** Кого эта роль может пригласить. Для ответа ручки и для подсказки в интерфейсе. */
export const invitableRoles = (actorRole: EmployeeRole): EmployeeRole[] =>
  (Object.keys(ROLE_RANK) as EmployeeRole[]).filter((role) => canInviteRole(actorRole, role));

export const isEmployeeRole = (value: unknown): value is EmployeeRole =>
  typeof value === 'string' && value in ROLE_RANK;
