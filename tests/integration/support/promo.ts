import { db } from '#server/db';

/**
 * Чтение и уборка касаний промо-меток (issue #377).
 *
 * Уборка — по Telegram, который тест читал: касание пишет сервис или бот, а не фикстура,
 * и его `id` тесту неизвестен. Касание с человеком уборке людей не мешает — ключ
 * на `persons` стоит на `SET NULL`, — но строка осталась бы в базе.
 */

const readTelegramUserIds = new Set<bigint>();

export type TestPromoTouch = {
  code: string;
  telegramUserId: bigint;
  telegramChatId: bigint;
  personId: string | null;
  wasParticipant: boolean;
};

/** Касания этого Telegram в порядке записи. */
export const readTestPromoTouches = async (telegramUserId: bigint): Promise<TestPromoTouch[]> => {
  readTelegramUserIds.add(telegramUserId);

  return db.promoTouch.findMany({
    where: { telegramUserId },
    orderBy: { id: 'asc' },
    select: {
      code: true,
      telegramUserId: true,
      telegramChatId: true,
      personId: true,
      wasParticipant: true,
    },
  });
};

export const cleanupTestPromoTouches = async (): Promise<void> => {
  const telegramUserIds = [...readTelegramUserIds].map((telegramUserId) => telegramUserId.toString());
  readTelegramUserIds.clear();

  if (telegramUserIds.length === 0) {
    return;
  }

  await db.$executeRaw`
    DELETE FROM xb.promo_touches WHERE "telegram_user_id" = ANY(${telegramUserIds}::text[]::bigint[])
  `;
};
