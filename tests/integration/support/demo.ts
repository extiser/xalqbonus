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

/** Отдаёт уборке демо-зрителя и его демо-водителя. */
export const trackTestDemoViewer = (telegramUserId: bigint, personId: string): void => {
  trackedViewers.set(telegramUserId, personId);
  trackTestPerson(personId);
};

export const cleanupTestDemo = async (): Promise<void> => {
  const telegramUserIds = [...trackedViewers.keys()].map((telegramUserId) => telegramUserId.toString());
  const personIds = [...trackedViewers.values()];
  trackedViewers.clear();

  if (personIds.length === 0) {
    return;
  }

  await db.$executeRaw`
    DELETE FROM xb.demo_viewers WHERE "telegram_user_id" = ANY(${telegramUserIds}::text[]::bigint[])
  `;
  await db.$executeRaw`DELETE FROM xb.telegram_links WHERE "person_id" = ANY(${personIds}::uuid[])`;
  await db.$executeRaw`DELETE FROM xb.person_licenses WHERE "person_id" = ANY(${personIds}::uuid[])`;
};
