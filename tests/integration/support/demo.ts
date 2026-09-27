import { db } from '#server/db';
import { trackTestPerson } from './database';

/**
 * Уборка за тестами демо-доступа (issue #205).
 *
 * Демо-водителя заводит код под тестом, а не фикстура, и на него ссылаются строки, до которых
 * общая уборка по людям не доходит: запись демо-зрителя, привязка к его Telegram
 * и удостоверение. Они уходят здесь — первыми, — а сам человек, его профиль, участие, счёт
 * и перевод переноса — общей уборкой `support/database.ts`.
 */

const trackedViewers = new Map<bigint, string>();
const trackedDemoPersons = new Set<string>();
const trackedInvites = new Set<string>();

/** Отдаёт уборке демо-зрителя и его демо-водителя. */
export const trackTestDemoViewer = (telegramUserId: bigint, personId: string): void => {
  trackedViewers.set(telegramUserId, personId);
  trackTestPerson(personId);
};

/** Отдаёт уборке демо-водителя без зрителя — сгенерированного (issue #252). */
export const trackTestDemoPerson = (personId: string): void => {
  trackedDemoPersons.add(personId);
  trackTestPerson(personId);
};

/**
 * Отдаёт уборке приглашение в демо. Уходит первым: оно ссылается на сотрудника, которого
 * убирает `support/employees.ts`.
 */
export const trackTestDemoInvite = (inviteId: string): void => {
  trackedInvites.add(inviteId);
};

export const cleanupTestDemo = async (): Promise<void> => {
  const inviteIds = [...trackedInvites];
  trackedInvites.clear();

  if (inviteIds.length > 0) {
    await db.$executeRaw`DELETE FROM xb.demo_invites WHERE "id" = ANY(${inviteIds}::uuid[])`;
  }

  const telegramUserIds = [...trackedViewers.keys()].map((telegramUserId) => telegramUserId.toString());
  const personIds = [...trackedViewers.values(), ...trackedDemoPersons];
  trackedViewers.clear();
  trackedDemoPersons.clear();

  if (personIds.length === 0) {
    return;
  }

  await db.$executeRaw`
    DELETE FROM xb.demo_viewers WHERE "telegram_user_id" = ANY(${telegramUserIds}::text[]::bigint[])
  `;
  await db.$executeRaw`DELETE FROM xb.telegram_links WHERE "person_id" = ANY(${personIds}::uuid[])`;
  await db.$executeRaw`DELETE FROM xb.person_licenses WHERE "person_id" = ANY(${personIds}::uuid[])`;
};
