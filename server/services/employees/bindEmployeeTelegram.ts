import { consola } from 'consola';

import { db } from '#server/db';
import { lockAccessLinkByTokenHash, markAccessLinkUsed } from '#server/repositories/employeeAccessLinks';
import {
  findEmployeeByTelegramUserId,
  lockEmployeeById,
  setEmployeeTelegram,
} from '#server/repositories/employees';
import { findActiveLinkByTelegramOrPhone } from '#server/repositories/programMembership';
import { accessLinkState, type DeadAccessLinkOutcome } from '#server/services/employees/accessLinkState';
import { hashInviteToken } from '#server/services/employees/inviteToken';
import { describeDatabaseFailure, UNIQUE_VIOLATION } from '#server/utils/postgresErrors';

/**
 * Привязка Telegram к учётке сотрудника по ссылке `/start emp_<токен>` (issue #267).
 *
 * Личность — `from.id` апдейта: Telegram его подписывает, и руками он не вводится нигде.
 * Контакт не нужен: телефон у учётки уже есть, его задал приглашающий, и логином он служит
 * в вебе, а не здесь.
 *
 * Одной транзакцией с блокировкой строки ссылки: два одновременных `/start` одной ссылки идут
 * друг за другом, и второй видит её использованной.
 *
 * Здесь же правило одной роли: Telegram работающего водителя к учётке сотрудника не привязывается
 * (docs/decisions.md → «Учётка сотрудника и роли»). Отказ по роли ссылку не гасит: сотрудник
 * откроет её со своего Telegram.
 */

const log = consola.withTag('employees:telegram');

export type BindEmployeeTelegramOutcome =
  | 'bound'
  | DeadAccessLinkOutcome
  /** Этот Telegram за активной водительской привязкой. */
  | 'telegram_driver'
  /** Этот Telegram уже привязан к другой учётке сотрудника. */
  | 'telegram_employee'
  /** У учётки Telegram уже есть. */
  | 'already_bound';

export type BindEmployeeTelegramRequest = {
  token: string;
  telegramUserId: bigint;
  now?: Date;
};

export const bindEmployeeTelegram = async (
  request: BindEmployeeTelegramRequest,
): Promise<BindEmployeeTelegramOutcome> => {
  const now = request.now ?? new Date();
  const tokenHash = hashInviteToken(request.token);

  try {
    return await db.$transaction(async (transaction): Promise<BindEmployeeTelegramOutcome> => {
      const state = accessLinkState(await lockAccessLinkByTokenHash(tokenHash, transaction), 'telegram', now);

      if (state.outcome !== 'live') {
        return state.outcome;
      }

      const employee = await lockEmployeeById(state.link.employeeId, transaction);

      if (!employee) {
        throw new Error(`учётки ${state.link.employeeId} нет, а ссылка на неё есть`);
      }

      if (employee.telegramUserId !== null) {
        return 'already_bound';
      }

      const driverLink = await findActiveLinkByTelegramOrPhone(request.telegramUserId, null, transaction);

      if (driverLink) {
        log.warn('Telegram не привязан: он за активной водительской привязкой', {
          employeeId: employee.id,
          personId: driverLink.personId,
        });

        return 'telegram_driver';
      }

      if (await findEmployeeByTelegramUserId(request.telegramUserId, transaction)) {
        return 'telegram_employee';
      }

      // Строка учётки под блокировкой, и Telegram у неё пуст — ноль здесь поломка, а не гонка.
      if (!(await setEmployeeTelegram(employee.id, request.telegramUserId, transaction))) {
        throw new Error(`Telegram учётки ${employee.id} не записался под блокировкой`);
      }

      await markAccessLinkUsed(state.link.id, now, transaction);

      log.info('Telegram привязан к учётке сотрудника', { employeeId: employee.id });

      return 'bound';
    });
  } catch (error) {
    // Тот же Telegram, привязанный в ту же секунду к другой учётке второй ссылкой, отбивается
    // уникальным индексом `employees_telegram_user_id_key`, а не порядком проверок.
    if (describeDatabaseFailure(error)?.code === UNIQUE_VIOLATION) {
      return 'telegram_employee';
    }

    throw error;
  }
};
