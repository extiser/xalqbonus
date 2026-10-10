import { db } from '#server/db';
import type { PromoEntry, PromoMedium, PromoTouchChannel } from '#server/generated/prisma/enums';

/**
 * Чтение и уборка касаний промо-меток (issue #377), метки и привязки воронки (issue #380).
 *
 * Уборка касаний — по Telegram, который тест читал или которым писал: касание пишет сервис
 * или бот, а не фикстура, и его `id` тесту неизвестен. Касание с человеком уборке людей
 * не мешает — ключ на `persons` стоит на `SET NULL`, — но строка осталась бы в базе.
 *
 * Привязки и метки убираются здесь же и раньше людей (`cleanupTestData`): у привязки внешний
 * ключ на человека, и человека с привязкой база не удалит.
 */

const readTelegramUserIds = new Set<bigint>();
const createdLinkIds = new Set<string>();
const createdPromoCodes = new Set<string>();

export type TestPromoTouch = {
  code: string;
  telegramUserId: bigint;
  telegramChatId: bigint;
  personId: string | null;
  wasParticipant: boolean;
  channel: PromoTouchChannel;
  launchedAt: Date | null;
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
      channel: true,
      launchedAt: true,
    },
  });
};

export type TestPromoTouchInput = {
  code: string;
  telegramUserId: bigint;
  touchedAt: Date;
  /** Чат — по умолчанию тот же Telegram: в личке бота `chat.id` равен `from.id`. */
  telegramChatId?: bigint;
  wasParticipant?: boolean;
};

/**
 * Касание задним числом — минуя бота: время касания воронка сравнивает с вступлением и режет
 * по суткам, и тесту нужно задать его самому. Человек не проставляется — воронка его не читает.
 */
export const insertTestPromoTouch = async (touch: TestPromoTouchInput): Promise<void> => {
  readTelegramUserIds.add(touch.telegramUserId);

  await db.promoTouch.create({
    data: {
      code: touch.code,
      telegramUserId: touch.telegramUserId,
      telegramChatId: touch.telegramChatId ?? touch.telegramUserId,
      wasParticipant: touch.wasParticipant ?? false,
      touchedAt: touch.touchedAt,
    },
  });
};

/**
 * Метка справочника с заданным временем заведения: от него начинается ряд дней. Носитель —
 * плакат, если не сказано иное: экран заявки открывает только реклама в Telegram (issue #456).
 * Вход — чат бота, если не сказано иное: так его ставит база (issue #467).
 */
export const createTestPromoLink = async (
  code: string,
  createdAt: Date,
  medium: PromoMedium = 'poster',
  entry: PromoEntry = 'bot',
): Promise<void> => {
  createdPromoCodes.add(code);

  await db.promoLink.create({ data: { code, name: `Тест ${code}`, medium, entry, createdAt } });
};

let nextCode = 0;

/** Код тестовой метки: свой у каждого теста, чтобы цифры одной метки не мешались с другой. */
export const nextTestPromoCode = (): string => {
  nextCode += 1;

  return `p_test${Date.now().toString(36)}${nextCode}`;
};

export type TestTelegramLinkInput = {
  personId: string;
  linkedAt: Date;
  telegramChatId: bigint;
  /** Пусто — перенесённая из старой базы привязка: от Telegram у неё только чат. */
  telegramUserId: bigint | null;
};

/** Привязка Telegram с заданным временем — вступление человека в программу. */
export const linkTestTelegram = async (input: TestTelegramLinkInput): Promise<void> => {
  const link = await db.telegramLink.create({
    data: {
      personId: input.personId,
      telegramChatId: input.telegramChatId,
      telegramUserId: input.telegramUserId,
      linkedAt: input.linkedAt,
      confirmedBy: 'phone_auto',
    },
  });

  createdLinkIds.add(link.id);
};

/** Делает тестового человека демо-водителем. */
export const markTestPersonDemo = async (personId: string): Promise<void> => {
  await db.person.update({ where: { id: personId }, data: { isDemo: true } });
};

export const cleanupTestPromoTouches = async (): Promise<void> => {
  const telegramUserIds = [...readTelegramUserIds].map((telegramUserId) => telegramUserId.toString());
  const linkIds = [...createdLinkIds];
  const codes = [...createdPromoCodes];
  readTelegramUserIds.clear();
  createdLinkIds.clear();
  createdPromoCodes.clear();

  if (telegramUserIds.length > 0) {
    await db.$executeRaw`
      DELETE FROM xb.promo_touches WHERE "telegram_user_id" = ANY(${telegramUserIds}::text[]::bigint[])
    `;
  }

  if (linkIds.length > 0) {
    await db.$executeRaw`DELETE FROM xb.telegram_links WHERE "id" = ANY(${linkIds}::uuid[])`;
  }

  if (codes.length > 0) {
    await db.promoLink.deleteMany({ where: { code: { in: codes } } });
  }
};
