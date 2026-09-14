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
  /** Канонический вид, тот же, которым входят. */
  phoneE164: string;
};

export type EmployeeLoginResponse = {
  employee: EmployeeIdentity;
};

/**
 * Кто пришёл этим запросом. Роль здесь — из базы, а не из cookie: выключенная учётка
 * обязана выпадать немедленно, а не после истечения cookie.
 */
export type EmployeeMeResponse = {
  employee: EmployeeIdentity;
};

export type EmployeeLogoutResponse = {
  /** Сессии погашены на сервере: сохранённый до выхода cookie больше не работает. */
  signedOut: true;
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

/** Офис, за которым закреплён сотрудник. */
export type EmployeeAccountOffice = {
  officeId: string;
  name: string;
  archived: boolean;
};

/**
 * Учётка сотрудника: строка экрана сотрудников и вариант выбора на странице офиса (issue #120,
 * #132).
 *
 * Ни хеша пароля, ни Telegram-идентификатора — только признаки, по которым экран решает,
 * что показать.
 */
export type EmployeeAccount = {
  employeeId: string;
  fullName: string;
  role: EmployeeRole;
  phoneE164: string;
  /** Учётка выключена. Закрепить её за офисом можно, но в списке это видно. */
  disabled: boolean;
  /** Пароль задан. Нет — сбрасывать нечего, а сотрудник задаёт его в Mini App. */
  passwordSet: boolean;
  /** Закреплённые офисы из `employee_offices`. */
  offices: EmployeeAccountOffice[];
  /**
   * Роль работает в любом офисе парка — решено по `ANY_OFFICE_ROLES` на сервере, чтобы
   * список таких ролей не повторялся условием в разметке.
   */
  anyOffice: boolean;
  /** Смотрящий вправе выключить, включить учётку и сбросить ей пароль. */
  manageable: boolean;
};

export type EmployeeAccountsResponse = {
  employees: EmployeeAccount[];
  /** Кого смотрящий вправе пригласить — роли строго ниже своей. */
  invitableRoles: EmployeeRole[];
};

/** Висящее приглашение: ссылки в нём нет — она показывается один раз при выпуске. */
export type EmployeePendingInvite = {
  inviteId: string;
  role: EmployeeRole;
  invitedByName: string;
  /** ISO-8601. */
  createdAt: string;
  /** ISO-8601. */
  expiresAt: string;
  /** Смотрящий вправе отозвать: роль приглашения строго ниже его роли. */
  revocable: boolean;
};

export type EmployeeInvitesResponse = {
  invites: EmployeePendingInvite[];
};

export type EmployeeDisabledResponse = {
  employeeId: string;
  disabled: boolean;
};

export type EmployeePasswordResetResponse = {
  employeeId: string;
  /** Пароля у учётки больше нет, выданные cookie погашены. Сам пароль не показывается никому. */
  passwordReset: true;
};
