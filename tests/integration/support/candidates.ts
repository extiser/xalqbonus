import { db } from '#server/db';
import type { Language } from '#server/generated/prisma/enums';

/**
 * Заявки кандидатов для тестов (issue #460) и их уборка — по Telegram, которым заявка заведена.
 */

const createdTelegramUserIds = new Set<bigint>();

export type TestCandidateApplicationInput = {
  telegramUserId: bigint;
  promoCode: string;
  phoneE164: string;
  language: Language;
  writeAllowed: boolean;
  createdAt: Date;
};

/** Открытая заявка — «Новая», номер введён руками: чужие заявки по номеру она не закрывает. */
export const insertTestCandidateApplication = async (input: TestCandidateApplicationInput): Promise<void> => {
  createdTelegramUserIds.add(input.telegramUserId);

  await db.candidateApplication.create({
    data: {
      channel: 'miniapp',
      telegramUserId: input.telegramUserId,
      telegramChatId: input.telegramUserId,
      telegramName: 'Тест Кандидат',
      name: 'Азиз',
      phoneRaw: input.phoneE164.slice(4),
      phoneE164: input.phoneE164,
      phoneSource: 'manual',
      writeAllowed: input.writeAllowed,
      language: input.language,
      promoCode: input.promoCode,
      match: 'not_in_park',
      createdAt: input.createdAt,
    },
  });
};

export const cleanupTestCandidateApplications = async (): Promise<void> => {
  const telegramUserIds = [...createdTelegramUserIds];
  createdTelegramUserIds.clear();

  if (telegramUserIds.length > 0) {
    await db.candidateApplication.deleteMany({ where: { telegramUserId: { in: telegramUserIds } } });
  }
};
