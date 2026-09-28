/**
 * Контракт ручек сотрудников: вход в веб, приглашения, пароль, привязка Telegram.
 *
 * Типы лежат в `shared/`, потому что у них два потребителя — обработчик и разметка,
 * и второе описание тех же полей разошлось бы с первым на ближайшей правке.
 *
 * Хеша пароля нет ни в одном ответе. Ссылки с токеном приезжают, пока живы, и только тому,
 * кто вправе их выпустить (issue #267).
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
  /** Имя будущей учётки: так сотрудник виден в списке и в журнале. */
  fullName: string;
  /** Логин для входа. Любой номер: СМС не отправляем. */
  phone: string;
};

/** Выпущенное приглашение. Ссылка ведёт на страницу веба `/invite/<токен>`. */
export type EmployeeInviteResponse = {
  inviteId: string;
  role: EmployeeRole;
  fullName: string;
  /** Канонический вид — тот, которым сотрудник будет входить. */
  phoneE164: string;
  /** ISO-8601. Через 48 часов ссылка перестаёт работать. */
  expiresAt: string;
  link: string;
};

/** Чем кончилось приглашение, по которому уже не завести учётку. */
export type EmployeeInviteDeadOutcome = 'not_found' | 'expired' | 'accepted' | 'revoked';

/** Приглашение по токену — странице `/invite/<токен>`, без входа. */
export type EmployeeInviteLookupResponse =
  | {
      outcome: 'live';
      fullName: string;
      role: EmployeeRole;
      phoneE164: string;
      /** ISO-8601. */
      expiresAt: string;
    }
  | { outcome: EmployeeInviteDeadOutcome };

export type EmployeeInviteAcceptBody = {
  token: string;
  password: string;
};

/** Чем кончилась ссылка к учётке, которой больше нельзя воспользоваться. */
export type EmployeeAccessLinkDeadOutcome = 'not_found' | 'expired' | 'used' | 'revoked';

/** Ссылка «задать пароль» по токену — странице `/set-password/<токен>`, без входа. */
export type EmployeePasswordLinkLookupResponse =
  | {
      outcome: 'live';
      fullName: string;
      phoneE164: string;
      /** ISO-8601. */
      expiresAt: string;
    }
  | { outcome: EmployeeAccessLinkDeadOutcome };

export type EmployeePasswordLinkConsumeBody = {
  token: string;
  password: string;
};

/** Живая ссылка: адрес и срок. */
export type EmployeeLiveLink = {
  link: string;
  /** ISO-8601. */
  expiresAt: string;
};

/** Выпуск ссылки привязки Telegram — строке «Сотрудников» и шагу после принятия приглашения. */
export type EmployeeTelegramLinkResponse = {
  /** Telegram уже привязан: ссылка не нужна. */
  bound: boolean;
  /** Выпущенная ссылка на бота. `null` — Telegram уже привязан. */
  link: EmployeeLiveLink | null;
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
  /** Пароль задан. Нет — только что сброшен или учётка демо. */
  passwordSet: boolean;
  /**
   * Живая ссылка «задать пароль» (issue #267) — только тому, кто вправе сбросить пароль этой
   * учётке: ссылкой задают пароль и входят под этой учёткой.
   */
  passwordLink: EmployeeLiveLink | null;
  /** Telegram привязан: приложение сотрудника открывается в боте. Видно всем, кто видит список. */
  telegramBound: boolean;
  /**
   * Смотрящий вправе выпустить этой учётке ссылку привязки Telegram (issue #267): своей — всегда,
   * чужой — если вправе сбросить ей пароль. У демо-учётки — нет.
   */
  telegramLinkIssuable: boolean;
  /** Живая ссылка привязки Telegram — только тому, кто вправе её выпустить. */
  telegramLink: EmployeeLiveLink | null;
  /** Закреплённые офисы из `employee_offices`. */
  offices: EmployeeAccountOffice[];
  /**
   * Роль работает в любом офисе парка — решено по `ANY_OFFICE_ROLES` на сервере, чтобы
   * список таких ролей не повторялся условием в разметке.
   */
  anyOffice: boolean;
  /** Демо-сотрудник (issue #205): помечен «ДЕМО», править его может только владелец (#212). */
  isDemo: boolean;
  /** Смотрящий вправе выключить, включить учётку и сбросить ей пароль. */
  manageable: boolean;
};

export type EmployeeAccountsResponse = {
  employees: EmployeeAccount[];
  /** Кого смотрящий вправе пригласить — роли строго ниже своей. */
  invitableRoles: EmployeeRole[];
};

/** Висящее приглашение. */
export type EmployeePendingInvite = {
  inviteId: string;
  role: EmployeeRole;
  /** Пусто у выпущенных до приёма в вебе. */
  fullName: string | null;
  phoneE164: string | null;
  invitedByName: string;
  /** ISO-8601. */
  createdAt: string;
  /** ISO-8601. */
  expiresAt: string;
  /** Смотрящий вправе отозвать: роль приглашения строго ниже его роли. */
  revocable: boolean;
  /**
   * Ссылка приглашения (issue #267) — тому, кто вправе её выпустить (`revocable`). `null` —
   * права нет или токена нет: выпущено до того, как ссылки стали хранить.
   */
  link: string | null;
};

export type EmployeeInvitesResponse = {
  invites: EmployeePendingInvite[];
};

export type EmployeeDisabledResponse = {
  employeeId: string;
  disabled: boolean;
};

/**
 * Пароля у учётки больше нет, выданные cookie погашены. Сам пароль не показывается никому:
 * новый сотрудник задаёт сам по ссылке, которую ему пересылают (issue #267).
 */
export type EmployeePasswordResetResponse = {
  employeeId: string;
  /** Страница `/set-password/<токен>`. */
  link: string;
  /** ISO-8601. */
  expiresAt: string;
};
