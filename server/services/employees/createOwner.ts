import { consola } from 'consola';

import { findEmployeeByPhone, insertEmployee } from '#server/repositories/employees';
import { isPasswordAcceptable, hashPassword } from '#server/services/employees/password';
import { normalizePhoneE164 } from '#server/utils/phoneNumber';

/**
 * Заведение первого владельца.
 *
 * Приглашением `owner` не заводится: приглашать можно роль строго ниже своей, а выше
 * владельца ролей нет. Он единственный, кого создают руками при выкате (docs/decisions.md
 * → «Учётка сотрудника и роли»), и отсюда же берётся вся цепочка — владелец приглашает
 * админов, админы менеджеров.
 *
 * Telegram у владельца не заполняется: привязывается он только одноразовой ссылкой,
 * а ссылку владельцу выписывать некому. В веб он входит по телефону и паролю, и этого
 * достаточно, чтобы выпустить первое приглашение.
 *
 * Повторный прогон на существующем телефоне второй учётки не создаёт и пароль не меняет:
 * цель выката, молча переустанавливающая пароль владельца, — это способ потерять доступ
 * на ровном месте.
 */

const log = consola.withTag('employees:owner');

export type CreateOwnerOutcome =
  | 'created'
  /** Учётка на этот телефон уже есть. Ничего не изменено. */
  | 'already_exists'
  /** Номер не приводится к каноническому виду. */
  | 'phone_invalid'
  | 'password_too_short'
  /** Имя пустое: учётка без имени не отличима от другой такой же в списке сотрудников. */
  | 'name_empty';

export type CreateOwnerRequest = {
  phoneRaw: string;
  fullName: string;
  password: string;
  now?: Date;
};

export type CreateOwnerResult =
  | { outcome: 'created'; employeeId: string; phoneE164: string }
  | { outcome: 'already_exists'; employeeId: string; phoneE164: string }
  | { outcome: Exclude<CreateOwnerOutcome, 'created' | 'already_exists'> };

export const createOwner = async (request: CreateOwnerRequest): Promise<CreateOwnerResult> => {
  const phoneE164 = normalizePhoneE164(request.phoneRaw);

  if (!phoneE164) {
    return { outcome: 'phone_invalid' };
  }

  const fullName = request.fullName.trim();

  if (fullName === '') {
    return { outcome: 'name_empty' };
  }

  if (!isPasswordAcceptable(request.password)) {
    return { outcome: 'password_too_short' };
  }

  const existing = await findEmployeeByPhone(phoneE164);

  if (existing) {
    return { outcome: 'already_exists', employeeId: existing.id, phoneE164 };
  }

  const createdAt = request.now ?? new Date();

  const employee = await insertEmployee({
    role: 'owner',
    fullName,
    phoneE164,
    passwordHash: await hashPassword(request.password),
    // Обе отметки ставятся сразу: пароль задан сейчас, и cookie, выпущенные до этого
    // момента, существовать не могут — учётки до этого момента не было вовсе.
    passwordChangedAt: createdAt,
    sessionsValidFrom: createdAt,
    telegramUserId: null,
  });

  log.info('владелец заведён', { employeeId: employee.id });

  return { outcome: 'created', employeeId: employee.id, phoneE164 };
};
