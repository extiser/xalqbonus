import { db } from '#server/db';
import type {
  CandidateApplicationEventKind,
  CandidateApplicationStatus,
  CandidateDraftMessageAuthor,
  CandidateMessageAuthor,
  CandidateMessageKind,
  CandidateMessageDelivery,
  CandidatePhoneSource,
  Language,
} from '#server/generated/prisma/enums';

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
  /** Имя из заявки. По умолчанию — «Азиз». */
  name?: string;
  /** По умолчанию — «Новая». */
  status?: CandidateApplicationStatus;
  /** По умолчанию — номер введён руками: чужие заявки по номеру он не закрывает. */
  phoneSource?: CandidatePhoneSource;
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
      name: input.name ?? 'Азиз',
      status: input.status ?? 'new',
      phoneRaw: input.phoneE164.slice(4),
      phoneE164: input.phoneE164,
      phoneSource: input.phoneSource ?? 'manual',
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

export type TestCandidateMessageInput = {
  applicationId: string;
  author: CandidateMessageAuthor;
  /** Обязателен у `employee`. */
  employeeId?: string;
  delivery: CandidateMessageDelivery;
  createdAt: Date;
};

let lastTestMessageId = 50_000 + Math.floor(Math.random() * 1_000_000);

/**
 * Сообщение переписки задним числом — минуя бота: «ждёт ответа» сравнивает моменты сообщений,
 * и тесту нужно задать их самому. У недоставленного причина — отказ Telegram.
 */
export const insertTestCandidateMessage = async (input: TestCandidateMessageInput): Promise<void> => {
  lastTestMessageId += 1;

  await db.candidateMessage.create({
    data: {
      applicationId: input.applicationId,
      author: input.author,
      employeeId: input.employeeId ?? null,
      kind: 'text',
      text: 'тест',
      candidateMessageId: input.author === 'candidate' ? lastTestMessageId : null,
      topicMessageId: input.author === 'employee' ? lastTestMessageId : null,
      delivery: input.delivery,
      failure: input.delivery === 'failed' || input.delivery === 'refused' ? 'telegram_error' : null,
      createdAt: input.createdAt,
    },
  });
};

/** Отметка сотрудника задним числом. Статус заявки она не меняет — это делает сервис. */
export const insertTestApplicationEvent = async (input: {
  applicationId: string;
  kind: CandidateApplicationEventKind;
  employeeId: string;
  createdAt: Date;
}): Promise<void> => {
  await db.candidateApplicationEvent.create({ data: input });
};

/** Telegram заявки был привязан к этому человеку раньше — так его находит подача заявки. */
export const setTestFormerLinkPerson = async (applicationId: string, personId: string): Promise<void> => {
  await db.candidateApplication.update({ where: { id: applicationId }, data: { formerLinkPersonId: personId } });
};

/** Незаконченный черновик заявки в чате — ждёт номер кнопкой. */
export const insertTestOpenChatDraft = async (input: {
  telegramUserId: bigint;
  promoCode: string;
}): Promise<{ draftId: string }> => {
  createdTelegramUserIds.add(input.telegramUserId);

  const draft = await db.candidateChatDraft.create({
    data: {
      telegramUserId: input.telegramUserId,
      telegramChatId: input.telegramUserId,
      telegramName: 'Тест Кандидат',
      promoCode: input.promoCode,
      language: 'ru',
      step: 'awaiting_contact',
      startedAt: new Date(),
    },
  });

  return { draftId: draft.id };
};

export type TestChatDraftInput = {
  telegramUserId: bigint;
  promoCode: string;
  startedAt: Date;
  /** Имя из Telegram. По умолчанию — «Тест Кандидат». */
  telegramName?: string;
  telegramUsername?: string | null;
  /** Номер черновика — шаг имени. Пусто — черновик ждёт номер. */
  phoneE164?: string;
  /** Заявка, которой черновик кончился. */
  applicationId?: string;
};

/** Черновик заявки в чате задним числом — «Не закончили» сравнивает начало с порогом. */
export const insertTestChatDraft = async (input: TestChatDraftInput): Promise<{ draftId: string }> => {
  createdTelegramUserIds.add(input.telegramUserId);

  const draft = await db.candidateChatDraft.create({
    data: {
      telegramUserId: input.telegramUserId,
      telegramChatId: input.telegramUserId,
      telegramName: input.telegramName ?? 'Тест Кандидат',
      telegramUsername: input.telegramUsername ?? null,
      promoCode: input.promoCode,
      language: 'ru',
      step: input.phoneE164 === undefined ? 'awaiting_contact' : 'awaiting_name',
      phoneRaw: input.phoneE164 ?? null,
      phoneE164: input.phoneE164 ?? null,
      applicationId: input.applicationId ?? null,
      startedAt: input.startedAt,
    },
  });

  return { draftId: draft.id };
};

export type TestDraftMessageInput = {
  draftId: string;
  author: CandidateDraftMessageAuthor;
  /** Обязателен у `employee`. */
  employeeId?: string;
  /** По умолчанию — текст. */
  kind?: CandidateMessageKind;
  /** По умолчанию — доставлено. */
  delivery?: 'delivered' | 'failed';
  createdAt: Date;
};

/**
 * Сообщение черновика задним числом — минуя бота: «ждёт ответа» сравнивает моменты сообщений.
 * У недоставленного причина — отказ Telegram.
 */
export const insertTestDraftMessage = async (input: TestDraftMessageInput): Promise<{ messageId: string }> => {
  lastTestMessageId += 1;

  const delivery = input.delivery ?? 'delivered';
  const message = await db.candidateDraftMessage.create({
    data: {
      draftId: input.draftId,
      author: input.author,
      employeeId: input.employeeId ?? null,
      kind: input.kind ?? 'text',
      text: input.kind === 'contact' ? null : 'тест',
      candidateMessageId: delivery === 'delivered' ? lastTestMessageId : null,
      delivery,
      failure: delivery === 'failed' ? 'telegram_error' : null,
      createdAt: input.createdAt,
    },
  });

  return { messageId: message.id };
};

/** Контакт, по которому черновик взял номер. */
export const setTestDraftPhoneMessage = async (draftId: string, messageId: string): Promise<void> => {
  await db.candidateChatDraft.update({ where: { id: draftId }, data: { phoneMessageId: messageId } });
};

export const readTestChatDraft = async (draftId: string) => db.candidateChatDraft.findUnique({ where: { id: draftId } });

/** Журнал отметок заявки по времени. */
export const readTestApplicationEvents = async (applicationId: string) =>
  db.candidateApplicationEvent.findMany({ where: { applicationId }, orderBy: { createdAt: 'asc' } });

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
    // Переписка и журнал отметок — тоже до заявок: внешние ключи на заявку стоят на `RESTRICT`.
    await db.candidateApplicationEvent.deleteMany({
      where: { application: { telegramUserId: { in: telegramUserIds } } },
    });
    await db.candidateMessage.deleteMany({
      where: { application: { telegramUserId: { in: telegramUserIds } } },
    });
    await db.candidateApplication.deleteMany({ where: { telegramUserId: { in: telegramUserIds } } });
  }
};
