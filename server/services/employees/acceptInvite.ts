import { consola } from 'consola';

import { db } from '#server/db';
import type { EmployeeRole } from '#server/generated/prisma/enums';
import {
  findEmployeeInviteByTokenHash,
  markEmployeeInviteAccepted,
} from '#server/repositories/employeeInvites';
import { findEmployeeByTelegramOrPhone, insertEmployee } from '#server/repositories/employees';
import { findActiveLinkByTelegramOrPhone } from '#server/repositories/programMembership';
import { hashInviteToken } from '#server/services/employees/inviteToken';
import { normalizePhoneE164 } from '#server/utils/phoneNumber';
import { describeDatabaseFailure, UNIQUE_VIOLATION } from '#server/utils/postgresErrors';

/**
 * Принятие приглашения: учётка сотрудника заводится здесь и только здесь.
 *
 * Одним действием человека приходит сразу и `telegram_user_id` из подписи апдейта,
 * и `phone_e164` из контакта. Ни то, ни другое нигде не вводится руками — опечатка,
 * привязывающая приложение постороннему, перестаёт существовать как класс
 * (docs/decisions.md → «Учётка сотрудника и роли»).
 *
 * Здесь же проверяется правило одной роли: водителем и сотрудником одновременно быть
 * нельзя. Если телефон или Telegram уже за активной водительской привязкой, приглашение
 * отклоняется текстом — оператор либо закрывает водительскую привязку с причиной
 * `operator`, либо заводит сотрудника на другой аккаунт. Молча переключённая роль
 * означала бы, что человек перестал видеть свой баланс и не понимает почему.
 *
 * Исход возвращается, а не бросается исключением: отказ приглашения — рабочий ответ,
 * на который бот обязан показать внятный текст (docs/principles.md → «Ошибки»).
 */

const log = consola.withTag('employees:invite');

/** Ссылку приняли между чтением и записью. Рабочий исход, а не поломка. */
class InviteTakenError extends Error {
  constructor(readonly inviteId: string) {
    super(`приглашение ${inviteId} принято другим запросом`);
    this.name = 'InviteTakenError';
  }
}

export type AcceptInviteOutcome =
  | 'accepted'
  /** Токена нет в базе: ссылка выдумана или испорчена по дороге. */
  | 'not_found'
  /** Срок вышел — 48 часов прошли. Выпускается новая ссылка. */
  | 'expired'
  /** Ссылка уже принята: она одноразовая. */
  | 'already_accepted'
  /** Приглашение отозвано выпустившим. */
  | 'revoked'
  /** Контакт принадлежит не отправителю — прислан через скрепку из адресной книги. */
  | 'contact_not_own'
  /** Номер не приводится к каноническому виду: логина из него не выйдет. */
  | 'phone_invalid'
  /** Этот Telegram или этот телефон уже за активной водительской привязкой. */
  | 'driver_link_exists'
  /** Этот Telegram или этот телефон уже за учёткой сотрудника. */
  | 'employee_exists';

export type AcceptInviteRequest = {
  token: string;
  /** Отправитель апдейта — `from.id`. */
  telegramUserId: bigint | null;
  /** Владелец присланного контакта — `contact.user_id`. */
  contactUserId: bigint | null;
  phoneRaw: string;
  /** Имя из Telegram: единственное, что известно о человеке до первого входа. */
  fullName: string;
  now?: Date;
};

export type AcceptInviteResult =
  | {
      outcome: 'accepted';
      employeeId: string;
      role: EmployeeRole;
    }
  | { outcome: Exclude<AcceptInviteOutcome, 'accepted'> };

export const acceptInvite = async (request: AcceptInviteRequest): Promise<AcceptInviteResult> => {
  const now = request.now ?? new Date();
  const invite = await findEmployeeInviteByTokenHash(hashInviteToken(request.token));

  if (!invite) {
    return { outcome: 'not_found' };
  }

  if (invite.revokedAt !== null) {
    return { outcome: 'revoked' };
  }

  if (invite.acceptedAt !== null) {
    return { outcome: 'already_accepted' };
  }

  if (invite.expiresAt <= now) {
    return { outcome: 'expired' };
  }

  // Контакт прикладывается не только кнопкой: через скрепку шлётся любая запись адресной
  // книги. Без этой проверки приглашение принимал бы один человек, а учётка заводилась бы
  // на номер другого (docs/drivers.md → «Телефон подтверждает только сам владелец»).
  if (
    request.telegramUserId === null ||
    request.contactUserId === null ||
    request.telegramUserId !== request.contactUserId
  ) {
    return { outcome: 'contact_not_own' };
  }

  const phoneE164 = normalizePhoneE164(request.phoneRaw);

  if (!phoneE164) {
    return { outcome: 'phone_invalid' };
  }

  const driverLink = await findActiveLinkByTelegramOrPhone(request.telegramUserId, phoneE164);

  if (driverLink) {
    log.warn('приглашение отклонено: Telegram или телефон за активной водительской привязкой', {
      inviteId: invite.id,
      personId: driverLink.personId,
    });

    return { outcome: 'driver_link_exists' };
  }

  const existingEmployee = await findEmployeeByTelegramOrPhone(request.telegramUserId, phoneE164);

  if (existingEmployee) {
    return { outcome: 'employee_exists' };
  }

  try {
    // Одной транзакцией: учётка без пометки в приглашении означала бы живую ссылку,
    // по которой заводится вторая учётка, а пометка без учётки — приглашение, потраченное
    // впустую и невосстановимое.
    const employee = await db.$transaction(async (transaction) => {
      const created = await insertEmployee(
        {
          role: invite.role,
          fullName: request.fullName,
          phoneE164,
          // Пароль сотрудник задаёт себе сам, из Mini App: заводить его за человека
          // некому и нечем — канала, по которому пароль передают, у нас нет.
          passwordHash: null,
          passwordChangedAt: null,
          sessionsValidFrom: null,
          telegramUserId: request.telegramUserId,
        },
        transaction,
      );

      const accepted = await markEmployeeInviteAccepted(invite.id, created.id, now, transaction);

      // Ноль изменённых строк означает, что ссылку приняли между нашим чтением и записью:
      // условие живёт в самом `UPDATE`, и повторной учётки от гонки не появляется.
      if (!accepted) {
        throw new InviteTakenError(invite.id);
      }

      return created;
    });

    log.info('приглашение принято, учётка заведена', {
      inviteId: invite.id,
      employeeId: employee.id,
      role: employee.role,
    });

    return { outcome: 'accepted', employeeId: employee.id, role: employee.role };
  } catch (error) {
    if (error instanceof InviteTakenError) {
      return { outcome: 'already_accepted' };
    }

    // Уникальность телефона и Telegram отбивается базой: проверка выше остаётся, но она
    // последняя линия, а не единственная — между чтением и вставкой помещается вторая
    // ссылка, принятая тем же человеком (docs/principles.md → «Идемпотентность»).
    if (describeDatabaseFailure(error)?.code === UNIQUE_VIOLATION) {
      log.warn('принятие приглашения отбито уникальным ограничением', {
        inviteId: invite.id,
        constraint: describeDatabaseFailure(error)?.constraintName ?? null,
      });

      return { outcome: 'employee_exists' };
    }

    throw error;
  }
};
