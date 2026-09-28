import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { text } from '#server/bot/texts';
import { TELEGRAM_LINK_LIFETIME_MS } from '#server/services/employees/config';
import { cleanupTestData, createTestPerson, disconnectDatabase } from '../support/database';
import {
  commandContent,
  createBotDouble,
  inlineCallbackUpdate,
  privateCallbackUpdate,
  privateMessageUpdate,
  type BotDouble,
  type MessageContent,
  type SentMessage,
} from '../support/bot';
import {
  cleanupTestEmployees,
  countTestLinkAttempts,
  createTestEmployee,
  findTestEmployeeByTelegram,
  insertTestInvite,
  issueTestAccessLink,
  linkTestDriver,
  nextTestPhone,
  nextTestTelegramUserId,
  readTestEmployee,
} from '../support/employees';

/**
 * Ответ бота на входящее сообщение: приветствие всем, привязка Telegram — сотруднику со ссылкой.
 *
 * Тестом покрыт не интерфейс бота, а разведение случаев одного и того же `/start`: ссылка
 * привязки `emp_` привязывает Telegram к учётке, ссылка прежнего приглашения `inv_` — уже
 * просто приветствие (issue #267). Ветка редкая, ломается молча, и обнаружилась бы тем, что
 * сотрудник со ссылкой вместо привязки получил рекламу приложения (docs/infra.md → «Тесты»).
 *
 * Второе, что здесь проверяется, — молчания больше нет. Бот, не ответивший ничего, не виден
 * ни в чате, ни в журнале: ровно так эта задача и нашлась, прогоном руками (`#93`). То же —
 * для нажатий кнопок старого бота, оставшихся в чатах водителей после переключения (`#284`).
 */

const CHAT_TEXT = 'Здравствуйте, хочу баллы';

/** Служебное сообщение, которым приветствие снимает клавиатуру старого бота под полем ввода. */
const isKeyboardRemoval = (message: SentMessage): boolean => {
  const markup = message.replyMarkup;

  return typeof markup === 'object' && markup !== null && 'remove_keyboard' in markup;
};

/** Экраны бота — то, что водитель читает, без служебных сообщений снятия клавиатуры. */
const screensOf = (bot: BotDouble): string[] =>
  bot.sent.filter((message) => !isKeyboardRemoval(message)).map((message) => message.text);

/** Контакт, присланный кнопкой Telegram: `user_id` есть, и он равен отправителю. */
const ownContact = (telegramUserId: bigint, phoneE164: string): MessageContent => ({
  contact: {
    phone_number: phoneE164,
    first_name: 'Азиз',
    user_id: Number(telegramUserId),
  },
});


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

    expect(screensOf(bot)).toEqual([text('start_greeting', 'ru')]);
    // Регистрация уехала в Mini App целиком: присланный боту контакт её не начинает,
    // и строки в журнале попыток от него не остаётся (`#86`).
    expect(await countTestLinkAttempts(telegramUserId)).toBe(0);
    expect(await findTestEmployeeByTelegram(telegramUserId)).toBeNull();
  });

  it('ссылка прежнего приглашения `inv_` бот больше не принимает — отвечает приветствием', async () => {
    const bot = createBotDouble();
    const owner = await createTestEmployee({ role: 'owner' });
    const { token } = await insertTestInvite({ invitedById: owner.employeeId });
    const telegramUserId = nextTestTelegramUserId();

    await bot.handleUpdate(privateMessageUpdate(telegramUserId, commandContent('/start', `inv_${token}`)));

    expect(screensOf(bot)).toEqual([text('start_greeting', 'ru')]);
    expect(await findTestEmployeeByTelegram(telegramUserId)).toBeNull();
  });

  it('ссылка привязки `emp_` привязывает Telegram к учётке, второй раз — уже не действует', async () => {
    const bot = createBotDouble();
    const employee = await createTestEmployee({ role: 'admin', telegramUserId: null });
    const token = await issueTestAccessLink(employee.employeeId, 'telegram', TELEGRAM_LINK_LIFETIME_MS);
    const telegramUserId = nextTestTelegramUserId();

    await bot.handleUpdate(privateMessageUpdate(telegramUserId, commandContent('/start', `emp_${token}`)));

    expect((await readTestEmployee(employee.employeeId))?.telegramUserId).toBe(telegramUserId);

    // Второй раз — с другого Telegram: ссылка одноразовая, и учётка остаётся за первым.
    await bot.handleUpdate(
      privateMessageUpdate(nextTestTelegramUserId(), commandContent('/start', `emp_${token}`)),
    );

    expect(bot.sent.map((message) => message.text)).toEqual([
      text('employee_telegram_bound', 'ru'),
      text('employee_telegram_used', 'ru'),
    ]);
    expect((await readTestEmployee(employee.employeeId))?.telegramUserId).toBe(telegramUserId);
  });

  it('Telegram водителя по ссылке привязки не привязывается', async () => {
    const bot = createBotDouble();
    const employee = await createTestEmployee({ role: 'manager', telegramUserId: null });
    const token = await issueTestAccessLink(employee.employeeId, 'telegram', TELEGRAM_LINK_LIFETIME_MS);
    const driver = await createTestPerson({ inProgram: true });
    const driverChatId = nextTestTelegramUserId();

    // Перенесённая привязка — один `chat_id`, без отправителя: так выглядит почти весь парк.
    await linkTestDriver(driver.personId, driverChatId);

    await bot.handleUpdate(privateMessageUpdate(driverChatId, commandContent('/start', `emp_${token}`)));

    expect(bot.sent.map((message) => message.text)).toEqual([text('employee_telegram_driver', 'ru')]);
    expect((await readTestEmployee(employee.employeeId))?.telegramUserId).toBeNull();
  });

  it('Telegram другой учётки и учётка с Telegram по ссылке привязки не привязываются', async () => {
    const bot = createBotDouble();
    const employee = await createTestEmployee({ role: 'manager', telegramUserId: null });
    const other = await createTestEmployee({ role: 'manager' });
    const token = await issueTestAccessLink(employee.employeeId, 'telegram', TELEGRAM_LINK_LIFETIME_MS);

    if (other.telegramUserId === null) {
      throw new Error('фикстура сотрудника завелась без Telegram');
    }

    await bot.handleUpdate(privateMessageUpdate(other.telegramUserId, commandContent('/start', `emp_${token}`)));

    const bound = await createTestEmployee({ role: 'manager' });
    const boundToken = await issueTestAccessLink(bound.employeeId, 'telegram', TELEGRAM_LINK_LIFETIME_MS);

    await bot.handleUpdate(
      privateMessageUpdate(nextTestTelegramUserId(), commandContent('/start', `emp_${boundToken}`)),
    );

    expect(bot.sent.map((message) => message.text)).toEqual([
      text('employee_telegram_employee', 'ru'),
      text('employee_telegram_already_bound', 'ru'),
    ]);
    expect((await readTestEmployee(employee.employeeId))?.telegramUserId).toBeNull();
  });

  it('ссылка в демо разбирается своим обработчиком, а не привязкой сотрудника и не приветствием', async () => {
    const bot = createBotDouble();
    const telegramUserId = nextTestTelegramUserId();

    await bot.handleUpdate(
      privateMessageUpdate(telegramUserId, commandContent('/start', 'demo_нет-такого')),
    );

    // Ответ сразу, без запроса контакта: зритель входит по `from.id` (issue #252).
    expect(bot.sent.map((message) => message.text)).toEqual([text('demo_invite_unknown', 'ru')]);
    expect(await findTestEmployeeByTelegram(telegramUserId)).toBeNull();
  });

  it('сотрудник получает своё приветствие, а не водительское', async () => {
    const bot = createBotDouble();
    const { telegramUserId } = await createTestEmployee({ role: 'manager' });

    if (telegramUserId === null) {
      throw new Error('фикстура сотрудника завелась без Telegram');
    }

    await bot.handleUpdate(privateMessageUpdate(telegramUserId, { text: CHAT_TEXT }));

    // Кнопка запуска та же: какой экран показать, приложение решает само (T25).
    expect(screensOf(bot)).toEqual([text('employee_greeting', 'ru')]);
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

    expect(screensOf(bot)).toEqual(contents.map(() => greeting));

    // В чате остаётся одно сообщение бота — последнее приветствие: служебное сообщение снятия
    // клавиатуры удаляется сразу, каждое приветствие снимает прежнее.
    const deletedIds = new Set(bot.deleted.map((message) => message.messageId));
    const remaining = bot.sent.filter((message) => !deletedIds.has(message.messageId));

    expect(bot.deleted).toHaveLength(bot.sent.length - 1);
    expect(remaining.map((message) => message.messageId)).toEqual([bot.sent.at(-1)?.messageId]);
    expect(await countTestLinkAttempts(telegramUserId)).toBe(0);
  });

  it('приветствие снимает клавиатуру старого бота под полем ввода и не оставляет следа', async () => {
    const bot = createBotDouble();

    await bot.handleUpdate(privateMessageUpdate(nextTestTelegramUserId(), { text: CHAT_TEXT }));

    // Клавиатура снимается только отправкой, и одним сообщением с приветствием это не сделать:
    // у приветствия в `reply_markup` кнопка приложения. Поэтому перед ним — служебное
    // сообщение с `remove_keyboard`, и сразу его удаление.
    const [removal, greeting] = bot.sent;

    expect(bot.calls).toEqual(['sendMessage', 'deleteMessage', 'sendMessage']);
    expect(removal?.replyMarkup).toEqual({ remove_keyboard: true });
    expect(bot.deleted.map((message) => message.messageId)).toEqual([removal?.messageId]);
    expect(greeting?.text).toBe(text('start_greeting', 'ru'));
  });

  it('нажатие незнакомой кнопки в личном чате — ответ на нажатие и приветствие', async () => {
    const bot = createBotDouble();
    const update = privateCallbackUpdate(nextTestTelegramUserId(), 'language_set_uz');

    await bot.handleUpdate(update);

    // Ответ на нажатие — первым: он снимает индикатор загрузки на кнопке. Дальше то же, что
    // на сообщение: снятие клавиатуры и приветствие.
    expect(bot.answeredCallbackQueries).toEqual([update.callback_query?.id]);
    expect(bot.calls).toEqual(['answerCallbackQuery', 'sendMessage', 'deleteMessage', 'sendMessage']);
    expect(screensOf(bot)).toEqual([text('start_greeting', 'ru')]);
  });

  it('нажатие под inline-сообщением — только ответ на нажатие, приветствовать некуда', async () => {
    const bot = createBotDouble();
    const update = inlineCallbackUpdate(nextTestTelegramUserId(), 'language_set_uz');

    await bot.handleUpdate(update);

    expect(bot.answeredCallbackQueries).toEqual([update.callback_query?.id]);
    expect(bot.calls).toEqual(['answerCallbackQuery']);
  });
});
