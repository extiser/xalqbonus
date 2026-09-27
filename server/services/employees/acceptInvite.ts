import { consola } from 'consola';

import { db } from '#server/db';
import {
  findEmployeeInviteByTokenHash,
  lockEmployeeInviteByTokenHash,
  markEmployeeInviteAccepted,
} from '#server/repositories/employeeInvites';
import { findEmployeeByPhone, insertEmployee, type EmployeeRow } from '#server/repositories/employees';
import { findActiveLinkByTelegramOrPhone } from '#server/repositories/programMembership';
import { inviteState, type DeadInviteOutcome } from '#server/services/employees/inviteState';
import { hashInviteToken } from '#server/services/employees/inviteToken';
import { openSession, type OpenedSession } from '#server/services/employees/openSession';
import { hashPassword, isPasswordAcceptable } from '#server/services/employees/password';
import { describeDatabaseFailure, UNIQUE_VIOLATION } from '#server/utils/postgresErrors';

/**
 * Принятие приглашения в вебе (issue #267): учётка сотрудника заводится здесь и только здесь.
 *
 * Роль, имя и телефон — из приглашения, их задал приглашающий. Пароль задаёт принявший, и знает
 * его только он. Telegram пуст: привязывается потом и по желанию, ссылкой из веба
 * (docs/decisions.md → «Ссылка приглашения видна, пока жива; сотрудник принимает приглашение
 * в вебе»).
 *
 * Одной транзакцией с блокировкой строки приглашения: два одновременных «Принять» одной ссылки
 * идут друг за другом, и второе видит её принятой. Учётка без пометки в приглашении означала бы
 * живую ссылку, по которой заводится вторая учётка.
 *
 * Правило одной роли проверяется на момент принятия ещё раз: между выпуском и принятием проходят
 * часы, и водительская привязка на этот телефон могла появиться за это время.
 *
 * Исход возвращается, а не бросается исключением: отказ приглашения — рабочий ответ, на который
 * страница обязана показать внятный текст (docs/principles.md → «Ошибки»).
 */

const log = consola.withTag('employees:invite');

export type AcceptInviteOutcome =
  /** Учётка заведена, сессия открыта. Не `accepted`: так зовётся исход уже принятой ссылки. */
  | 'signed_in'
  | DeadInviteOutcome
  /** Пароль короче предела. Приглашение остаётся живым. */
  | 'password_too_short'
  /** Телефон приглашения уже за учёткой сотрудника. */
  | 'phone_taken'
  /** Телефон приглашения за активной водительской привязкой. */
  | 'driver_link_exists';

export type AcceptInviteRequest = {
  token: string;
  password: string;
  now?: Date;
};

export type AcceptInviteResult =
  | ({ outcome: 'signed_in' } & OpenedSession)
  | { outcome: Exclude<AcceptInviteOutcome, 'signed_in'> };

type AcceptInTransaction =
  | { outcome: 'signed_in'; employee: EmployeeRow }
  | { outcome: Exclude<AcceptInviteOutcome, 'signed_in'> };

export const acceptInvite = async (request: AcceptInviteRequest): Promise<AcceptInviteResult> => {
  const now = request.now ?? new Date();
  const tokenHash = hashInviteToken(request.token);

  // Первое чтение — без блокировки и до хеша пароля: `argon2id` дорог, а ручка открыта без
  // входа, и выдуманный токен не должен стоить серверу хеширования. Решает всё равно чтение
  // под блокировкой ниже.
  const before = inviteState(await findEmployeeInviteByTokenHash(tokenHash), now);

  if (before.outcome !== 'live') {
    return { outcome: before.outcome };
  }

  if (!isPasswordAcceptable(request.password)) {
    return { outcome: 'password_too_short' };
  }

  // Хеш считается вне транзакции: десятки миллисекунд держать блокировку строки незачем.
  const passwordHash = await hashPassword(request.password);

  try {
    const result = await db.$transaction(async (transaction): Promise<AcceptInTransaction> => {
      const state = inviteState(await lockEmployeeInviteByTokenHash(tokenHash, transaction), now);

      if (state.outcome !== 'live') {
        return { outcome: state.outcome };
      }

      const { invite } = state;

      if (await findEmployeeByPhone(invite.phoneE164, transaction)) {
        return { outcome: 'phone_taken' };
      }

      const driverLink = await findActiveLinkByTelegramOrPhone(null, invite.phoneE164, transaction);

      if (driverLink) {
        log.warn('приглашение не принято: телефон за активной водительской привязкой', {
          inviteId: invite.inviteId,
          personId: driverLink.personId,
        });

        return { outcome: 'driver_link_exists' };
      }

      const employee = await insertEmployee(
        {
          role: invite.role,
          fullName: invite.fullName,
          phoneE164: invite.phoneE164,
          passwordHash,
          passwordChangedAt: now,
          sessionsValidFrom: null,
          telegramUserId: null,
        },
        transaction,
      );

      // Строка под блокировкой и проверена выше, так что ноль здесь — поломка, а не гонка.
      if (!(await markEmployeeInviteAccepted(invite.inviteId, employee.id, now, transaction))) {
        throw new Error(`приглашение ${invite.inviteId} не отметилось принятым под блокировкой`);
      }

      log.info('приглашение принято, учётка заведена', {
        inviteId: invite.inviteId,
        employeeId: employee.id,
        role: employee.role,
      });

      return { outcome: 'signed_in', employee };
    });

    return result.outcome === 'signed_in'
      ? { outcome: 'signed_in', ...openSession(result.employee, now) }
      : { outcome: result.outcome };
  } catch (error) {
    // Уникальность телефона отбивается базой: проверка выше остаётся, но она последняя линия,
    // а не единственная — между чтением и вставкой помещается второе приглашение на тот же
    // номер, принятое в ту же секунду (docs/principles.md → «Идемпотентность»).
    if (describeDatabaseFailure(error)?.code === UNIQUE_VIOLATION) {
      log.warn('принятие приглашения отбито уникальным ограничением', {
        constraint: describeDatabaseFailure(error)?.constraintName ?? null,
      });

      return { outcome: 'phone_taken' };
    }

    throw error;
  }
};
