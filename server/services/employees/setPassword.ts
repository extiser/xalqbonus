import { consola } from 'consola';

import { findEmployeeById, updateEmployeePassword } from '#server/repositories/employees';
import { hashPassword, isPasswordAcceptable } from '#server/services/employees/password';

/**
 * Вошедший в веб сотрудник меняет себе пароль — на `/password`.
 *
 * Первый пароль задаётся на странице приглашения, после сброса — по ссылке «задать пароль»
 * (issue #267, `acceptInvite.ts`, `consumePasswordLink.ts`). Здесь — только смена тем, кто
 * уже вошёл. Пароль не выдаётся и не пересылается: придуманный за человека и отправленный
 * сообщением пароль остаётся в переписке навсегда (docs/decisions.md → «Учётка сотрудника
 * и роли»).
 *
 * Смена двигает отметку годности cookie, и этим гасятся все выданные: человек, сменивший
 * пароль, выходит на всех устройствах, включая то, с которого менял. Ту же отметку двигает
 * выход из веба (`signOut.ts`) — событий два, а отметка одна.
 * Восстановления «забыл пароль» нет — забывшему его сбрасывает владелец.
 */

const log = consola.withTag('employees:password');

export type SetPasswordOutcome =
  | 'changed'
  /** Пароль короче предела. */
  | 'too_short'
  /** Учётки нет: её выключили и удалили, пока запрос шёл. */
  | 'unknown_employee'
  /**
   * Демо-учётка (issue #205): своего входа у неё нет — под ней входит демо-зритель. Пароль
   * открыл бы в неё дверь из веба тому, кому демо показывали. База такую запись и не примет
   * (`employees_demo_no_login_check`), но отбивается здесь, а не ошибкой ограничения.
   */
  | 'demo_account';

export type SetPasswordRequest = {
  employeeId: string;
  password: string;
  now?: Date;
};

export const setPassword = async (request: SetPasswordRequest): Promise<SetPasswordOutcome> => {
  if (!isPasswordAcceptable(request.password)) {
    return 'too_short';
  }

  const employee = await findEmployeeById(request.employeeId);

  if (!employee) {
    return 'unknown_employee';
  }

  if (employee.isDemo) {
    return 'demo_account';
  }

  // Хеш считается до записи и вне транзакции: `argon2id` идёт десятки миллисекунд,
  // и держать на них открытую транзакцию незачем — писать тут одну строку.
  const passwordHash = await hashPassword(request.password);

  await updateEmployeePassword(employee.id, passwordHash, request.now ?? new Date());

  log.info('пароль задан', { employeeId: employee.id });

  return 'changed';
};
