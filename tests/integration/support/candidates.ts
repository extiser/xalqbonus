import { db } from '#server/db';
import type { Language } from '#server/generated/prisma/enums';

/**
 * Заявки кандидатов для тестов (issue #460) и их уборка — по Telegram, которым заявка заведена.
 * Вместе с заявкой убирается её переписка (issue #463) и черновики заявки в чате (issue #467).
 */

const createdTelegramUserIds = new Set<bigint>();

/**
 * Запоминает Telegram, которым заявку или черновик завёл сервис, а не фикстура: их строки
 * тесту неизвестны, и уборка находит их по Telegram.
 */
export const trackTestCandidateTelegram = (telegramUserId: bigint): void => {
  createdTelegramUserIds.add(telegramUserId);
};

export type TestCandidateApplicationInput = {
  telegramUserId: bigint;
  promoCode: string;
  phoneE164: string;
  language: Language;
  writeAllowed: boolean;
  createdAt: Date;
  /** Тема заявки в группе сотрудников. Пусто — темы нет. */
  forumChatId?: bigint;
  forumTopicId?: number;
};

/** Открытая заявка — «Новая», номер введён руками: чужие заявки по номеру она не закрывает. */
export const insertTestCandidateApplication = async (
  input: TestCandidateApplicationInput,
): Promise<{ applicationId: string }> => {
  createdTelegramUserIds.add(input.telegramUserId);

  const application = await db.candidateApplication.create({
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
      forumChatId: input.forumChatId ?? null,
      forumTopicId: input.forumTopicId ?? null,
    },
  });

  return { applicationId: application.id };
};

/** Переписка заявки по времени. */
export const readTestCandidateMessages = async (applicationId: string) =>
  db.candidateMessage.findMany({ where: { applicationId }, orderBy: { createdAt: 'asc' } });

export const readTestCandidateApplication = async (applicationId: string) =>
  db.candidateApplication.findUnique({ where: { id: applicationId } });

/** Черновики заявки в чате этого Telegram — все, законченные и нет. */
export const readTestChatDrafts = async (telegramUserId: bigint) =>
  db.candidateChatDraft.findMany({ where: { telegramUserId }, orderBy: { createdAt: 'asc' } });

/** Сообщения черновика по времени. */
export const readTestChatDraftMessages = async (draftId: string) =>
  db.candidateDraftMessage.findMany({ where: { draftId }, orderBy: { createdAt: 'asc' } });

/** Открытые заявки этого Telegram. */
export const readTestOpenApplications = async (telegramUserId: bigint) =>
  db.candidateApplication.findMany({ where: { telegramUserId, status: { in: ['new', 'in_progress'] } } });

export const cleanupTestCandidateApplications = async (): Promise<void> => {
  const telegramUserIds = [...createdTelegramUserIds];
  createdTelegramUserIds.clear();

  if (telegramUserIds.length > 0) {
    // Черновики — до заявок: внешний ключ черновика на заявку стоит на `RESTRICT`.
    await db.candidateDraftMessage.deleteMany({ where: { draft: { telegramUserId: { in: telegramUserIds } } } });
    await db.candidateChatDraft.deleteMany({ where: { telegramUserId: { in: telegramUserIds } } });
    // Переписка — тоже до заявок: внешний ключ сообщения на заявку стоит на `RESTRICT`.
    await db.candidateMessage.deleteMany({
      where: { application: { telegramUserId: { in: telegramUserIds } } },
    });
    await db.candidateApplication.deleteMany({ where: { telegramUserId: { in: telegramUserIds } } });
  }
};
