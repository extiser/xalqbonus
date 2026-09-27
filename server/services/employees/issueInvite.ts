import { consola } from 'consola';

import type { EmployeeRole } from '#server/generated/prisma/enums';
import { findLiveEmployeeInviteByPhone, insertEmployeeInvite } from '#server/repositories/employeeInvites';
import { findEmployeeByPhone } from '#server/repositories/employees';
import { findActiveLinkByTelegramOrPhone } from '#server/repositories/programMembership';
import { INVITE_LIFETIME_MS } from '#server/services/employees/config';
import { buildInvitePageLink } from '#server/services/employees/employeeLinks';
import { createInviteToken, hashInviteToken } from '#server/services/employees/inviteToken';
import { canInviteRole, type EmployeeActor } from '#server/services/employees/roles';
import { normalizeLoginPhone } from '#server/utils/phoneNumber';
// Относительным путём, а не через `#shared`: модуль читают тесты, у которых из псевдонимов
// настроен один `#server`.
import { EMPLOYEE_NAME_MAX_LENGTH } from '../../../shared/employee';

/**
 * Выпуск приглашения сотрудника (issue #267).
 *
 * Учётка здесь не заводится: она создаётся в момент принятия ссылки, и неиспользованное
 * приглашение не оставляет за собой мусорной учётки (docs/decisions.md → «Учётка
 * сотрудника и роли»).
 *
 * Имя и телефон задаёт приглашающий, принявший их не вводит. Номер любой — СМС не шлём,
 * телефон только логин. Ссылка ведёт на страницу веба, бот для выпуска не нужен.
 *
 * Правило одной роли проверяется уже здесь, по телефону: приглашение на номер водителя
 * отклоняется при выпуске, а не у человека, открывшего ссылку. При принятии проверка
 * повторяется — между выпуском и принятием проходят часы.
 */

const log = consola.withTag('employees:invite');

/** Приглашающий: то, что о нём знает проверка доступа. */
export type InviteActor = EmployeeActor;

export class RoleNotInvitableError extends Error {
  constructor(
    readonly actorRole: EmployeeRole,
    readonly invitedRole: EmployeeRole,
  ) {
    super(`роль ${actorRole} не может пригласить роль ${invitedRole}`);
    this.name = 'RoleNotInvitableError';
  }
}

/** Что не так с именем или телефоном приглашения. Текст к каждой причине — у ручки. */
export type InviteProblem =
  /** Имени нет: так сотрудник будет виден в списке и в журнале. */
  | 'full_name_missing'
  /** Имя длиннее `EMPLOYEE_NAME_MAX_LENGTH`. */
  | 'full_name_too_long'
  /** Номер не приводится к виду «плюс и от 7 до 15 цифр». */
  | 'phone_invalid'
  /** Телефон за другой учёткой сотрудника или за живым приглашением. */
  | 'phone_taken'
  /** Телефон за активной водительской привязкой — водителем и сотрудником быть нельзя. */
  | 'driver_link_exists';

export class InviteInputError extends Error {
  constructor(readonly problem: InviteProblem) {
    super(`приглашение не годится: ${problem}`);
    this.name = 'InviteInputError';
  }
}

export type IssueInviteRequest = {
  actor: InviteActor;
  role: EmployeeRole;
  fullName: string;
  phoneRaw: string;
  /** Схема и хост приложения — из запроса: ссылка ведёт туда же (`server/utils/appOrigin.ts`). */
  appOrigin: string;
  /** Момент выпуска. Аргументом — чтобы срок проверялся тестом, а не ожиданием двух суток. */
  now?: Date;
};

export type IssuedInvite = {
  inviteId: string;
  role: EmployeeRole;
  fullName: string;
  phoneE164: string;
  expiresAt: Date;
  link: string;
};

export const issueInvite = async (request: IssueInviteRequest): Promise<IssuedInvite> => {
  const { actor, role } = request;

  // Правило «строго ниже своей» проверяется здесь, а не в ручке: ручка разбирает запрос
  // и зовёт сервис, а решение о правах — это правило (docs/principles.md → «Слои»).
  if (!canInviteRole(actor.role, role)) {
    throw new RoleNotInvitableError(actor.role, role);
  }

  const fullName = request.fullName.trim();

  if (fullName === '') {
    throw new InviteInputError('full_name_missing');
  }

  if (fullName.length > EMPLOYEE_NAME_MAX_LENGTH) {
    throw new InviteInputError('full_name_too_long');
  }

  const phoneE164 = normalizeLoginPhone(request.phoneRaw);

  if (!phoneE164) {
    throw new InviteInputError('phone_invalid');
  }

  const now = request.now ?? new Date();

  if ((await findEmployeeByPhone(phoneE164)) || (await findLiveEmployeeInviteByPhone(phoneE164, now))) {
    throw new InviteInputError('phone_taken');
  }

  const driverLink = await findActiveLinkByTelegramOrPhone(null, phoneE164);

  if (driverLink) {
    log.warn('приглашение не выпущено: телефон за активной водительской привязкой', {
      personId: driverLink.personId,
    });

    throw new InviteInputError('driver_link_exists');
  }

  const token = createInviteToken();

  const invite = await insertEmployeeInvite({
    role,
    fullName,
    phoneE164,
    token,
    tokenHash: hashInviteToken(token),
    invitedById: actor.employeeId,
    expiresAt: new Date(now.getTime() + INVITE_LIFETIME_MS),
  });

  log.info('приглашение выпущено', { inviteId: invite.id, role, actorEmployeeId: actor.employeeId });

  return {
    inviteId: invite.id,
    role: invite.role,
    fullName,
    phoneE164,
    expiresAt: invite.expiresAt,
    link: buildInvitePageLink(request.appOrigin, token),
  };
};
