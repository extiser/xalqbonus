import { consola } from 'consola';

import { db } from '#server/db';
import {
  findAccessLinkByTokenHash,
  lockAccessLinkByTokenHash,
  markAccessLinkUsed,
} from '#server/repositories/employeeAccessLinks';
import { lockEmployeeById, updateEmployeePassword, type EmployeeRow } from '#server/repositories/employees';
import { accessLinkState, type DeadAccessLinkOutcome } from '#server/services/employees/accessLinkState';
import { hashInviteToken } from '#server/services/employees/inviteToken';
import { openSession, type OpenedSession } from '#server/services/employees/openSession';
import { hashPassword, isPasswordAcceptable } from '#server/services/employees/password';

/**
 * Пароль по ссылке «задать пароль» после сброса (issue #267): пароль, отметка смены, отметка
 * годности сессий, ссылка использована и токен стёрт — и сразу вход, как после пароля на `/login`.
 *
 * Одной транзакцией с блокировкой строки ссылки: два одновременных открытия идут друг за другом,
 * и второе видит ссылку использованной.
 *
 * Выключенной учётке пароль не задаётся, и ссылка остаётся живой: входа по нему всё равно
 * не будет, а включат учётку — ссылка пригодится, если срок не выйдет.
 */

const log = consola.withTag('employees:password');

export type ConsumePasswordLinkOutcome =
  | 'changed'
  | DeadAccessLinkOutcome
  /** Пароль короче предела. Ссылка остаётся живой. */
  | 'password_too_short'
  /** Учётка выключена. */
  | 'disabled';

export type ConsumePasswordLinkRequest = {
  token: string;
  password: string;
  now?: Date;
};

export type ConsumePasswordLinkResult =
  | ({ outcome: 'changed' } & OpenedSession)
  | { outcome: Exclude<ConsumePasswordLinkOutcome, 'changed'> };

type ConsumeInTransaction =
  | { outcome: 'changed'; employee: EmployeeRow }
  | { outcome: Exclude<ConsumePasswordLinkOutcome, 'changed'> };

export const consumePasswordLink = async (
  request: ConsumePasswordLinkRequest,
): Promise<ConsumePasswordLinkResult> => {
  const now = request.now ?? new Date();
  const tokenHash = hashInviteToken(request.token);

  // Первое чтение — без блокировки и до хеша пароля: ручка открыта без входа, и выдуманный
  // токен не должен стоить серверу `argon2id`. Решает чтение под блокировкой ниже.
  const before = accessLinkState(await findAccessLinkByTokenHash(tokenHash), 'password', now);

  if (before.outcome !== 'live') {
    return { outcome: before.outcome };
  }

  if (!isPasswordAcceptable(request.password)) {
    return { outcome: 'password_too_short' };
  }

  const passwordHash = await hashPassword(request.password);

  const result = await db.$transaction(async (transaction): Promise<ConsumeInTransaction> => {
    const state = accessLinkState(await lockAccessLinkByTokenHash(tokenHash, transaction), 'password', now);

    if (state.outcome !== 'live') {
      return { outcome: state.outcome };
    }

    const employee = await lockEmployeeById(state.link.employeeId, transaction);

    if (!employee) {
      throw new Error(`учётки ${state.link.employeeId} нет, а ссылка на неё есть`);
    }

    if (employee.disabledAt !== null) {
      return { outcome: 'disabled' };
    }

    // Отметка годности сессий двигается вместе с паролем: всё, что было выпущено до этого,
    // гаснет, а cookie, который выдаётся ниже, выпущен в ту же секунду и остаётся годным.
    await updateEmployeePassword(employee.id, passwordHash, now, transaction);
    await markAccessLinkUsed(state.link.id, now, transaction);

    return { outcome: 'changed', employee };
  });

  if (result.outcome !== 'changed') {
    return { outcome: result.outcome };
  }

  log.info('пароль задан по ссылке', { employeeId: result.employee.id });

  return { outcome: 'changed', ...openSession(result.employee, now) };
};
