/**
 * Контракт ручек сотрудников: вход в веб, приглашения, пароль.
 *
 * Типы лежат в `shared/`, потому что у них два потребителя — обработчик и разметка,
 * и второе описание тех же полей разошлось бы с первым на ближайшей правке.
 *
 * Ни в одном ответе нет ни хеша пароля, ни токена приглашения, кроме единственного места,
 * где токен и выпускается: ссылка показывается один раз, и восстановить её неоткуда —
 * в базе лежит только её хеш.
 */

import type { EmployeeRole } from '../../server/generated/prisma/enums';

/** Кто вошёл. Ответ на вход и на любую ручку, которой нужно назвать текущего сотрудника. */
export type EmployeeIdentity = {
  employeeId: string;
  role: EmployeeRole;
  fullName: string;
};

export type EmployeeLoginResponse = {
  employee: EmployeeIdentity;
};

export type EmployeeInviteRequestBody = {
  role: EmployeeRole;
};

/** Выпущенное приглашение. Единственный ответ, содержащий готовую ссылку. */
export type EmployeeInviteResponse = {
  inviteId: string;
  role: EmployeeRole;
  /** ISO-8601. Через 48 часов ссылка перестаёт работать. */
  expiresAt: string;
  /** Показывается один раз: второй раз её не отдаст никто, включая нас. */
  link: string;
};

export type EmployeeInviteRevokeResponse = {
  inviteId: string;
  revoked: true;
};

export type EmployeePasswordRequestBody = {
  password: string;
};

export type EmployeePasswordResponse = {
  /** Смена пароля гасит все выданные cookie, включая тот, которым её и делали. */
  passwordChanged: true;
};
