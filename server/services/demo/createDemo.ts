import { consola } from 'consola';

import { db } from '#server/db';
import { findDemoOfficeId } from '#server/repositories/demo';
import { findDemoEmployee, findEmployeeByPhone, insertEmployee } from '#server/repositories/employees';
import { insertOffice, replaceOfficeEmployees } from '#server/repositories/offices';
import { findActiveLinkByTelegramOrPhone } from '#server/repositories/programMembership';
import { normalizePhoneE164 } from '#server/utils/phoneNumber';

/**
 * Общее демо — то, что у всех демо-зрителей одно (issue #205): ДЕМО ОФИС и демо-менеджер,
 * закреплённый за ним. Под демо-менеджером входит зритель, выбравший роль менеджера.
 *
 * Пароля и Telegram у демо-менеджера нет: своего входа у выдуманной учётки быть не должно,
 * под ней входит только зритель, чья личность пришла подписанной `initData`. Телефон есть —
 * он обязателен всякой учётке, — и правило одной роли проверяется на нём так же, как при
 * заведении владельца.
 *
 * Одной транзакцией: офис без менеджера — демо, в которое не войти, а менеджер без офиса
 * видит пустой экран. Повторный прогон ничего не создаёт: демо-менеджер один на роль, и это
 * держит частичный уникальный индекс, а не только проверка ниже.
 */
const log = consola.withTag('demo:create');

export const DEMO_OFFICE_NAME = 'ДЕМО ОФИС';
export const DEMO_OFFICE_ADDRESS = 'Демо-адрес';
export const DEMO_MANAGER_NAME = 'ДЕМО МЕНЕДЖЕР';

export type CreateDemoResult =
  | { outcome: 'created'; officeId: string; employeeId: string }
  /** Демо-менеджер уже есть. Ничего не изменено. */
  | { outcome: 'already_exists'; officeId: string | null; employeeId: string; phoneE164: string }
  /** Номер не приводится к виду `+998XXXXXXXXX`. */
  | { outcome: 'phone_invalid' }
  /** Телефон занят другой учёткой сотрудника. */
  | { outcome: 'phone_taken' }
  /** Телефон за активной водительской привязкой: водителем и сотрудником быть нельзя. */
  | { outcome: 'driver_link_exists' };

export const createDemo = async (managerPhoneRaw: string): Promise<CreateDemoResult> => {
  const phoneE164 = normalizePhoneE164(managerPhoneRaw);

  if (!phoneE164) {
    return { outcome: 'phone_invalid' };
  }

  const existing = await findDemoEmployee('manager');

  if (existing) {
    return {
      outcome: 'already_exists',
      officeId: await findDemoOfficeId(),
      employeeId: existing.id,
      phoneE164: existing.phoneE164,
    };
  }

  // Порядок тот же, что у владельца и приглашения: водительская привязка до существующей учётки.
  if (await findActiveLinkByTelegramOrPhone(null, phoneE164)) {
    return { outcome: 'driver_link_exists' };
  }

  if (await findEmployeeByPhone(phoneE164)) {
    return { outcome: 'phone_taken' };
  }

  const created = await db.$transaction(async (transaction) => {
    const office = await insertOffice(
      {
        name: DEMO_OFFICE_NAME,
        address: DEMO_OFFICE_ADDRESS,
        mapUrl: null,
        workHours: null,
        phoneE164: null,
        telegram: null,
        isDemo: true,
      },
      transaction,
    );

    const employee = await insertEmployee(
      {
        role: 'manager',
        fullName: DEMO_MANAGER_NAME,
        phoneE164,
        passwordHash: null,
        passwordChangedAt: null,
        sessionsValidFrom: null,
        telegramUserId: null,
        isDemo: true,
      },
      transaction,
    );

    await replaceOfficeEmployees(office.id, [employee.id], transaction);

    return { officeId: office.id, employeeId: employee.id };
  });

  log.info('демо заведено', created);

  return { outcome: 'created', ...created };
};
