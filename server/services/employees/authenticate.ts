import { consola } from 'consola';

import { readBotToken } from '#server/bot/config';
import type { EmployeeRole } from '#server/generated/prisma/enums';
import {
  findEmployeeById,
  findEmployeeByTelegramUserId,
  type EmployeeRow,
} from '#server/repositories/employees';
import {
  readSessionSecret,
  SESSION_MAX_AGE_SECONDS,
} from '#server/services/employees/config';
import { checkEmployeeSession } from '#server/utils/employeeSession';
import { checkInitData } from '#server/utils/telegramInitData';

/**
 * Кто пришёл: одна проверка на обе двери.
 *
 * Дверь доказывает, кто пришёл, и на этом её роль кончается: дальше ручки получают одно
 * и то же — роль и идентификатор сотрудника, — и «начислить баллы водителю» обязано
 * работать одинаково под сессией веба и под `initData` (docs/decisions.md → «Доступ
 * определяется ролью, а не дверью»).
 *
 * Учётка поднимается из базы на **каждом** запросе, и это не расточительность, а замена
 * таблицы сессий: `disabled_at` выбрасывает человека немедленно, а `sessions_valid_from`
 * позже времени выпуска cookie гасит все выданные cookie разом — её двигают и выход
 * из веба, и смена пароля. Роль тоже читается
 * из базы: та, что лежит в cookie, — подсказка для лога, а не основание для доступа
 * (docs/principles.md → «Доверие к входным данным»).
 *
 * Mini App своей сессии не имеет вовсе: каждый запрос несёт `initData`, и cookie ему
 * не нужен.
 */

const log = consola.withTag('employees:auth');

export type AuthenticatedEmployee = {
  employeeId: string;
  role: EmployeeRole;
  fullName: string;
  phoneE164: string;
};

export type AuthOutcome =
  | 'authenticated'
  /** Ни cookie, ни `initData`: человек не представился вовсе. */
  | 'no_credentials'
  /** Подпись не сошлась, строка испорчена или просрочена. */
  | 'invalid_credentials'
  /** Подпись верна, но сотрудника с таким идентификатором нет. */
  | 'unknown_employee'
  /** Учётка выключена. */
  | 'disabled'
  /** Сессии погашены после выпуска cookie — выходом из веба или сменой пароля. */
  | 'sessions_revoked';

export type AuthResult =
  | { outcome: 'authenticated'; employee: AuthenticatedEmployee }
  | { outcome: Exclude<AuthOutcome, 'authenticated'> };

export type AuthRequest = {
  /** Значение cookie сессии. `null`, если его не прислали. */
  cookieValue: string | null;
  /** Строка `initData` из Mini App. `null`, если запрос пришёл не оттуда. */
  initData: string | null;
  now?: Date;
};

const asAuthenticated = (employee: EmployeeRow): AuthenticatedEmployee => ({
  employeeId: employee.id,
  role: employee.role,
  fullName: employee.fullName,
  phoneE164: employee.phoneE164,
});

/** Дверь Mini App: личность приходит подписанной, сессии за ней нет. */
const authenticateByInitData = async (initData: string, now: Date): Promise<AuthResult> => {
  const token = readBotToken();

  if (token === '') {
    // Машина без токена бота проверить подпись не может ничем. Отказом в доступе это
    // притворяться не должно: в логе окажутся «неверные подписи» вместо незаполненной
    // переменной (server/utils/telegramInitData.ts).
    throw new Error('проверка initData невозможна: TG_BOT_TOKEN не задан');
  }

  const check = checkInitData({ initData, token, now });

  if (check.outcome !== 'valid') {
    log.warn('initData не прошла проверку', { outcome: check.outcome });

    return { outcome: 'invalid_credentials' };
  }

  const employee = await findEmployeeByTelegramUserId(check.user.id);

  if (!employee) {
    return { outcome: 'unknown_employee' };
  }

  if (employee.disabledAt !== null) {
    return { outcome: 'disabled' };
  }

  return { outcome: 'authenticated', employee: asAuthenticated(employee) };
};

/** Дверь веба: подписанный cookie плюс сверка с учёткой в базе. */
const authenticateByCookie = async (cookieValue: string, now: Date): Promise<AuthResult> => {
  const session = checkEmployeeSession({
    cookieValue,
    secret: readSessionSecret(),
    maxAgeSeconds: SESSION_MAX_AGE_SECONDS,
    now,
  });

  if (session.outcome !== 'valid') {
    log.warn('cookie сессии не прошёл проверку', { outcome: session.outcome });

    return { outcome: 'invalid_credentials' };
  }

  const employee = await findEmployeeById(session.employeeId);

  if (!employee) {
    return { outcome: 'unknown_employee' };
  }

  if (employee.disabledAt !== null) {
    return { outcome: 'disabled' };
  }

  // Годность решает одна отметка, а не перечисление событий, которые её двигают: выход
  // и смена пароля пишут `sessions_valid_from`, а проверка сверяется только с ней. Проверяй
  // она два поля сразу, третий способ погасить сессии дописали бы в одно и забыли про другое.
  //
  // Секундами, потому что временем выпуска в cookie лежат секунды: сравнение миллисекундной
  // отметки базы с округлённой вниз секундой выбрасывало бы человека из веба сразу после
  // того, как он сам же задал пароль.
  const sessionsValidFromSeconds =
    employee.sessionsValidFrom === null
      ? null
      : Math.floor(employee.sessionsValidFrom.getTime() / 1000);

  if (sessionsValidFromSeconds !== null && sessionsValidFromSeconds > session.issuedAtSeconds) {
    log.info('cookie погашен', { employeeId: employee.id });

    return { outcome: 'sessions_revoked' };
  }

  return { outcome: 'authenticated', employee: asAuthenticated(employee) };
};

/**
 * Проверяет обе двери и отдаёт одно и то же.
 *
 * `initData` идёт первой: Mini App несёт её в каждом запросе, и когда приложение открыто
 * в браузере, где уже лежит cookie веба, личностью является тот, кто открыл приложение.
 */
export const authenticateEmployee = async (request: AuthRequest): Promise<AuthResult> => {
  const now = request.now ?? new Date();

  if (request.initData !== null && request.initData.trim() !== '') {
    return authenticateByInitData(request.initData, now);
  }

  if (request.cookieValue !== null && request.cookieValue.trim() !== '') {
    return authenticateByCookie(request.cookieValue, now);
  }

  return { outcome: 'no_credentials' };
};
