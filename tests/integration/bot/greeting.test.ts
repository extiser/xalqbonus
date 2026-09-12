import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { text } from '#server/bot/texts';
import { insertEmployeeInvite } from '#server/repositories/employeeInvites';
import { INVITE_LIFETIME_MS } from '#server/services/employees/config';
import { createInviteToken, hashInviteToken } from '#server/services/employees/inviteToken';
import { cleanupTestData, disconnectDatabase } from '../support/database';
import {
  commandContent,
  createBotDouble,
  privateMessageUpdate,
  type MessageContent,
} from '../support/bot';
import {
  cleanupTestEmployees,
  countTestLinkAttempts,
  createTestEmployee,
  findTestEmployeeByTelegram,
  nextTestPhone,
  nextTestTelegramUserId,
} from '../support/employees';

/**
 * Ответ бота на входящее сообщение: приветствие всем, приглашение — приглашённому.
 *
 * Тестом покрыт не интерфейс бота, а разведение двух случаев одного и того же апдейта:
 * контакт в незакрытом потоке приглашения заводит учётку сотрудника, контакт вне его —
 * только приветствие. Ветка редкая, ломается молча, и обнаружилась бы тем, что человек
 * с выписанной ссылкой вместо учётки получил рекламу приложения (docs/infra.md → «Тесты»).
 *
 * Второе, что здесь проверяется, — молчания больше нет. Бот, не ответивший ничего, не виден
 * ни в чате, ни в журнале: ровно так эта задача и нашлась, прогоном руками (`#93`).
 */

const CHAT_TEXT = 'Здравствуйте, хочу баллы';

/** Контакт, присланный кнопкой Telegram: `user_id` есть, и он равен отправителю. */
const ownContact = (telegramUserId: bigint, phoneE164: string): MessageContent => ({
  contact: {
    phone_number: phoneE164,
    first_name: 'Азиз',
    user_id: Number(telegramUserId),
  },
});

const insertInviteFor = async (invitedById: string): Promise<string> => {
  const token = createInviteToken();

  await insertEmployeeInvite({
    role: 'admin',
    tokenHash: hashInviteToken(token),
    invitedById,
    expiresAt: new Date(Date.now() + INVITE_LIFETIME_MS),
  });

  return token;
};

describe('ответ бота на входящее сообщение', () => {
  let miniAppUrlBefore: string | undefined;

  beforeAll(() => {
    miniAppUrlBefore = process.env.TG_MINIAPP_URL;
    // Приветствие без адреса приходит и без кнопки — проверять надо то, что видит водитель
    // на машине с настроенным адресом.
    process.env.TG_MINIAPP_URL = 'https://example.test/app';
  });

  afterAll(async () => {
    if (miniAppUrlBefore === undefined) {
      delete process.env.TG_MINIAPP_URL;
    } else {
      process.env.TG_MINIAPP_URL = miniAppUrlBefore;
    }

    await disconnectDatabase();
  });

  afterEach(async () => {
    await cleanupTestEmployees();
    await cleanupTestData();
  });

  it('контакт вне приглашения отвечает приветствием, а привязку не начинает', async () => {
    const bot = createBotDouble();
    const telegramUserId = nextTestTelegramUserId();

    await bot.handleUpdate(
      privateMessageUpdate(telegramUserId, ownContact(telegramUserId, nextTestPhone())),
    );

    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0]?.text).toBe(text('start_greeting', 'ru'));
    // Регистрация уехала в Mini App целиком: присланный боту контакт её не начинает,
    // и строки в журнале попыток от него не остаётся (`#86`).
    expect(await countTestLinkAttempts(telegramUserId)).toBe(0);
    expect(await findTestEmployeeByTelegram(telegramUserId)).toBeNull();
  });

  it('контакт в потоке приглашения заводит учётку, и приветствие водителя не приходит', async () => {
    const bot = createBotDouble();
    const owner = await createTestEmployee({ role: 'owner' });
    const token = await insertInviteFor(owner.employeeId);
    const telegramUserId = nextTestTelegramUserId();

    await bot.handleUpdate(
      privateMessageUpdate(telegramUserId, commandContent('/start', `inv_${token}`)),
    );
    await bot.handleUpdate(
      privateMessageUpdate(telegramUserId, ownContact(telegramUserId, nextTestPhone())),
    );

    const employee = await findTestEmployeeByTelegram(telegramUserId);

    expect(employee?.role).toBe('admin');

    const greeting = text('start_greeting', 'ru');

    expect(bot.sent.map((message) => message.text)).toEqual([
      text('invite_ask_contact', 'ru'),
      text('invite_accepted', 'ru', { name: 'Азиз Каримов' }),
    ]);
    expect(bot.sent.some((message) => message.text === greeting)).toBe(false);
  });

  it('контакт после принятого приглашения — уже просто сообщение, и отвечает приветствием', async () => {
    const bot = createBotDouble();
    const owner = await createTestEmployee({ role: 'owner' });
    const token = await insertInviteFor(owner.employeeId);
    const telegramUserId = nextTestTelegramUserId();

    await bot.handleUpdate(
      privateMessageUpdate(telegramUserId, commandContent('/start', `inv_${token}`)),
    );
    await bot.handleUpdate(
      privateMessageUpdate(telegramUserId, ownContact(telegramUserId, nextTestPhone())),
    );
    // Ссылка одноразовая, и токен после принятия забыт: второй контакт из того же чата
    // разбирать приглашением уже нечем.
    await bot.handleUpdate(
      privateMessageUpdate(telegramUserId, ownContact(telegramUserId, nextTestPhone())),
    );

    expect(bot.sent.at(-1)?.text).toBe(text('start_greeting', 'ru'));
  });

  it('текст, фото, стикер, голосовое и пересланное дают одно и то же приветствие', async () => {
    const bot = createBotDouble();
    const telegramUserId = nextTestTelegramUserId();

    const contents: MessageContent[] = [
      commandContent('/start'),
      { text: CHAT_TEXT },
      { photo: [{ file_id: 'photo-1', file_unique_id: 'photo-1', width: 90, height: 90 }] },
      {
        sticker: {
          file_id: 'sticker-1',
          file_unique_id: 'sticker-1',
          type: 'regular',
          width: 512,
          height: 512,
          is_animated: false,
          is_video: false,
        },
      },
      { voice: { file_id: 'voice-1', file_unique_id: 'voice-1', duration: 3 } },
      {
        text: 'Пересланное',
        forward_origin: {
          type: 'hidden_user',
          date: Math.floor(Date.now() / 1_000),
          sender_user_name: 'Кто-то',
        },
      },
    ];

    for (const content of contents) {
      await bot.handleUpdate(privateMessageUpdate(telegramUserId, content));
    }

    const greeting = text('start_greeting', 'ru');

    expect(bot.sent).toHaveLength(contents.length);
    expect(bot.sent.every((message) => message.text === greeting)).toBe(true);

    // В чате остаётся одно сообщение бота: каждая отправка снимает прежнюю, и удалений
    // ровно на одно меньше, чем отправок.
    expect(bot.deleted.map((message) => message.messageId)).toEqual(
      bot.sent.slice(0, -1).map((message) => message.messageId),
    );
    expect(await countTestLinkAttempts(telegramUserId)).toBe(0);
  });
});
