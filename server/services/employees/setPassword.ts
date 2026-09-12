import { consola } from 'consola';

import { findEmployeeById, updateEmployeePassword } from '#server/repositories/employees';
import { hashPassword, isPasswordAcceptable } from '#server/services/employees/password';

/**
 * Сотрудник задаёт себе пароль — сам, из Mini App, после принятия приглашения.
 *
 * Пароль не выдаётся и не пересылается: канала, по которому его можно передать, у нас нет,
 * а придуманный за человека и отправленный сообщением пароль остаётся в переписке навсегда
 * (docs/decisions.md → «Учётка сотрудника и роли»).
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
  | 'unknown_employee';

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

  // Хеш считается до записи и вне транзакции: `argon2id` идёт десятки миллисекунд,
  // и держать на них открытую транзакцию незачем — писать тут одну строку.
  const passwordHash = await hashPassword(request.password);

  await updateEmployeePassword(employee.id, passwordHash, request.now ?? new Date());

  log.info('пароль задан', { employeeId: employee.id });

  return 'changed';
};
