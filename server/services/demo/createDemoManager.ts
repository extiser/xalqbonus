import { consola } from 'consola';

import { findDemoEmployee, findEmployeeByPhone, insertEmployee } from '#server/repositories/employees';
import { findActiveLinkByTelegramOrPhone } from '#server/repositories/programMembership';
import { DEMO_MANAGER_NAME, type CreateDemoResult } from '#server/services/demo/createDemo';
import { normalizePhoneE164 } from '#server/utils/phoneNumber';
import { describeDatabaseFailure, UNIQUE_VIOLATION } from '#server/utils/postgresErrors';

/**
 * Демо-менеджер из раздела «Демо» (issue #252) — без офиса: демо-офисы заводятся в «Офисах»
 * галочкой «Демо», а закрепляются за ним отдельно (`setDemoManagerOffices`).
 *
 * Проверки и исходы — как у `createDemo`: номер, водительская привязка до существующей
 * учётки, занятый телефон, уже заведённый демо-менеджер. Пароля и Telegram у него нет: под
 * ним входит только зритель, чья личность пришла подписанной `initData`. Демо-менеджер один
 * на роль — это держит частичный уникальный индекс `employees_demo_role_key`, а не только
 * проверка ниже.
 */
const log = consola.withTag('demo:manager');

export type CreateDemoManagerResult =
  | { outcome: 'created'; employeeId: string }
  | Exclude<CreateDemoResult, { outcome: 'created' }>;

export const createDemoManager = async (phoneRaw: string): Promise<CreateDemoManagerResult> => {
  const phoneE164 = normalizePhoneE164(phoneRaw);

  if (!phoneE164) {
    return { outcome: 'phone_invalid' };
  }

  const existing = await findDemoEmployee('manager');

  if (existing) {
    return { outcome: 'already_exists', officeId: null, employeeId: existing.id, phoneE164: existing.phoneE164 };
  }

  if (await findActiveLinkByTelegramOrPhone(null, phoneE164)) {
    return { outcome: 'driver_link_exists' };
  }

  if (await findEmployeeByPhone(phoneE164)) {
    return { outcome: 'phone_taken' };
  }

  try {
    const employee = await insertEmployee({
      role: 'manager',
      fullName: DEMO_MANAGER_NAME,
      phoneE164,
      passwordHash: null,
      passwordChangedAt: null,
      sessionsValidFrom: null,
      telegramUserId: null,
      isDemo: true,
    });

    log.info('демо-менеджер заведён', { employeeId: employee.id });

    return { outcome: 'created', employeeId: employee.id };
  } catch (error) {
    // Между проверками и вставкой поместился второй запрос: телефон или демо-роль заняты им.
    if (describeDatabaseFailure(error)?.code === UNIQUE_VIOLATION) {
      const raced = await findDemoEmployee('manager');

      if (raced) {
        return { outcome: 'already_exists', officeId: null, employeeId: raced.id, phoneE164: raced.phoneE164 };
      }

      return { outcome: 'phone_taken' };
    }

    throw error;
  }
};
