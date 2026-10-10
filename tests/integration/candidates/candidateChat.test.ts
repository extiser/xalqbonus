import type { Message } from 'grammy/types';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { findApplicationByTopic } from '#server/repositories/candidateApplications';
import { findEmployeeByTelegramUserId } from '#server/repositories/employees';
import { readCandidateMessageKind } from '#server/services/candidates/candidateMessageKind';
import { relayCandidateMessage } from '#server/services/candidates/relayCandidateMessage';
import { relayEmployeeReply } from '#server/services/candidates/relayEmployeeReply';
import { resolveTopicReplier } from '#server/services/candidates/resolveTopicReplier';
import {
  cleanupTestCandidateApplications,
  insertTestCandidateApplication,
  readTestCandidateApplication,
  readTestCandidateMessages,
} from '../support/candidates';
import { disconnectDatabase } from '../support/database';
import { cleanupTestEmployees, createTestEmployee, nextTestPhone, nextTestTelegramUserId } from '../support/employees';
import { nextTestPromoCode } from '../support/promo';

/**
 * Переписка с кандидатом через группу сотрудников (issue #463).
 *
 * Покрыто то, что docs/infra.md → «Тесты» относит к исключениям:
 *
 * - **доступ** — кто вправе писать кандидату из темы: ветки выключенной учётки, демо,
 *   чужого Telegram и анонимного администратора в обычной работе не встречаются и ломаются
 *   молча — кандидату ушло бы сообщение от имени парка, подписанное кем попало;
 * - **сырой SQL** — вставка строки переписки с `ON CONFLICT DO NOTHING` по частичным индексам,
 *   через сервисы пересылки, которыми её читает бот;
 * - **повтор апдейта** — Telegram повторяет webhook, и второе такое же сообщение строки
 *   не добавляет и второй раз не отправляется.
 *
 * Отправка в Telegram не подменяется: получатели фикстур — отрицательные ID вне
 * `TG_OUTGOING_ALLOWLIST`, и адаптер заглушает отправку сам, отвечая «выполнено».
 */

// Поиск учётки по Telegram — настоящий, кроме одного случая: демо-учётке база Telegram
// не даёт вовсе (`employees_demo_no_login_check`), и ветку «демо» сервиса иначе не пройти.
vi.mock('#server/repositories/employees', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#server/repositories/employees')>();

  return { ...actual, findEmployeeByTelegramUserId: vi.fn(actual.findEmployeeByTelegramUserId) };
});

const TOKEN = 'test-token';

let lastMessageId = 1_000;

const nextMessageId = (): number => {
  lastMessageId += 1;

  return lastMessageId;
};

let lastTopicId = 10_000 + Math.floor(Math.random() * 1_000_000);

/** Заявка с темой в группе: группа — отрицательный ID вне списка разрешённых получателей. */
const createApplicationWithTopic = async () => {
  const telegramUserId = nextTestTelegramUserId();
  const forumChatId = nextTestTelegramUserId();
  lastTopicId += 1;
  const forumTopicId = lastTopicId;

  const { applicationId } = await insertTestCandidateApplication({
    telegramUserId,
    promoCode: nextTestPromoCode(),
    phoneE164: nextTestPhone(),
    language: 'ru',
    writeAllowed: true,
    createdAt: new Date(),
    forumChatId,
    forumTopicId,
  });

  const application = await findApplicationByTopic(forumChatId, forumTopicId);

  if (!application) {
    throw new Error('заявка с темой не нашлась по теме');
  }

  return { applicationId, application, telegramUserId, forumChatId, forumTopicId };
};

/** Сообщение кандидата в личке бота. */
const privateMessage = (telegramUserId: bigint, text: string): Message => ({
  message_id: nextMessageId(),
  date: Math.floor(Date.now() / 1_000),
  chat: { id: Number(telegramUserId), type: 'private', first_name: 'Азиз' },
  from: { id: Number(telegramUserId), is_bot: false, first_name: 'Азиз' },
  text,
});

/** Сообщение в теме группы кандидатов. */
const topicMessage = (input: {
  forumChatId: bigint;
  forumTopicId: number;
  fromTelegramUserId: bigint;
  text: string;
  senderChat?: boolean;
}): Message => ({
  message_id: nextMessageId(),
  date: Math.floor(Date.now() / 1_000),
  chat: { id: Number(input.forumChatId), type: 'supergroup', title: 'XB тест тем', is_forum: true },
  from: { id: Number(input.fromTelegramUserId), is_bot: false, first_name: 'Сотрудник' },
  message_thread_id: input.forumTopicId,
  is_topic_message: true,
  text: input.text,
  ...(input.senderChat === true
    ? { sender_chat: { id: Number(input.forumChatId), type: 'supergroup' as const, title: 'XB тест тем' } }
    : {}),
});

const contentOf = (message: Message) => {
  const content = readCandidateMessageKind(message);

  if (!content) {
    throw new Error('сообщение фикстуры прочиталось служебным');
  }

  return content;
};

describe('кто отвечает кандидату из темы', () => {
  afterEach(async () => {
    await cleanupTestEmployees();
  });

  it('сотрудник с привязанным Telegram — отвечает', async () => {
    const employee = await createTestEmployee({ role: 'manager' });

    if (employee.telegramUserId === null) {
      throw new Error('фикстура сотрудника без Telegram');
    }

    const replier = await resolveTopicReplier(
      topicMessage({ forumChatId: -1n, forumTopicId: 1, fromTelegramUserId: employee.telegramUserId, text: 'Здравствуйте' }),
    );

    expect(replier).toEqual({ employeeId: employee.employeeId });
  });

  it('выключенная учётка — не отвечает', async () => {
    const employee = await createTestEmployee({ role: 'manager', disabledAt: new Date() });

    if (employee.telegramUserId === null) {
      throw new Error('фикстура сотрудника без Telegram');
    }

    expect(
      await resolveTopicReplier(
        topicMessage({ forumChatId: -1n, forumTopicId: 1, fromTelegramUserId: employee.telegramUserId, text: 'Да' }),
      ),
    ).toBeNull();
  });

  it('демо-учётка — не отвечает', async () => {
    const employee = await createTestEmployee({ role: 'manager' });

    if (employee.telegramUserId === null) {
      throw new Error('фикстура сотрудника без Telegram');
    }

    const row = await findEmployeeByTelegramUserId(employee.telegramUserId);

    if (!row) {
      throw new Error('фикстура сотрудника не нашлась по Telegram');
    }

    vi.mocked(findEmployeeByTelegramUserId).mockResolvedValueOnce({ ...row, isDemo: true });

    expect(
      await resolveTopicReplier(
        topicMessage({ forumChatId: -1n, forumTopicId: 1, fromTelegramUserId: employee.telegramUserId, text: 'Да' }),
      ),
    ).toBeNull();
  });

  it('Telegram без учётки сотрудника — не отвечает', async () => {
    expect(
      await resolveTopicReplier(
        topicMessage({ forumChatId: -1n, forumTopicId: 1, fromTelegramUserId: nextTestTelegramUserId(), text: 'Да' }),
      ),
    ).toBeNull();
  });

  it('сообщение от имени группы — анонимный администратор — не отвечает, даже с Telegram сотрудника', async () => {
    const employee = await createTestEmployee({ role: 'manager' });

    if (employee.telegramUserId === null) {
      throw new Error('фикстура сотрудника без Telegram');
    }

    expect(
      await resolveTopicReplier(
        topicMessage({
          forumChatId: -1n,
          forumTopicId: 1,
          fromTelegramUserId: employee.telegramUserId,
          text: 'Да',
          senderChat: true,
        }),
      ),
    ).toBeNull();
  });
});

describe('повтор апдейта переписки', () => {
  afterAll(async () => {
    await disconnectDatabase();
  });

  afterEach(async () => {
    await cleanupTestCandidateApplications();
    await cleanupTestEmployees();
  });

  it('сообщение кандидата: второй раз строку не добавляет и в тему не копируется', async () => {
    const { applicationId, application, telegramUserId } = await createApplicationWithTopic();
    const message = privateMessage(telegramUserId, 'Когда позвоните?');
    const input = { token: TOKEN, application, message, content: contentOf(message) };

    expect(await relayCandidateMessage(input)).toBe('delivered');
    expect(await relayCandidateMessage(input)).toBe('duplicate');

    const messages = await readTestCandidateMessages(applicationId);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      author: 'candidate',
      employeeId: null,
      kind: 'text',
      text: 'Когда позвоните?',
      candidateMessageId: message.message_id,
      delivery: 'delivered',
      failure: null,
    });
  });

  it('сообщение кандидата без темы — `failed` `no_topic`', async () => {
    const telegramUserId = nextTestTelegramUserId();
    const { applicationId } = await insertTestCandidateApplication({
      telegramUserId,
      promoCode: nextTestPromoCode(),
      phoneE164: nextTestPhone(),
      language: 'uz',
      writeAllowed: true,
      createdAt: new Date(),
    });
    const application = await readTestCandidateApplication(applicationId);

    if (!application) {
      throw new Error('заявка фикстуры не нашлась');
    }

    const message = privateMessage(telegramUserId, 'Salom');

    expect(await relayCandidateMessage({ token: TOKEN, application, message, content: contentOf(message) })).toBe(
      'no_topic',
    );

    const messages = await readTestCandidateMessages(applicationId);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ delivery: 'failed', failure: 'no_topic', topicMessageId: null });
  });

  it('ответ сотрудника: второй раз строку не добавляет, кандидату второй раз не уходит', async () => {
    const { applicationId, application, forumChatId, forumTopicId } = await createApplicationWithTopic();
    const employee = await createTestEmployee({ role: 'manager' });

    if (employee.telegramUserId === null) {
      throw new Error('фикстура сотрудника без Telegram');
    }

    const message = topicMessage({
      forumChatId,
      forumTopicId,
      fromTelegramUserId: employee.telegramUserId,
      text: 'Приходите завтра в офис',
    });
    const input = { token: TOKEN, application, message, content: contentOf(message) };

    expect(await relayEmployeeReply(input)).toBe('delivered');
    expect(await relayEmployeeReply(input)).toBe('duplicate');

    const messages = await readTestCandidateMessages(applicationId);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      author: 'employee',
      employeeId: employee.employeeId,
      kind: 'text',
      text: 'Приходите завтра в офис',
      topicMessageId: message.message_id,
      delivery: 'delivered',
      failure: null,
    });

    // Первый ответ сотрудника переводит заявку в работу, и ведёт её ответивший.
    expect(await readTestCandidateApplication(applicationId)).toMatchObject({
      status: 'in_progress',
      handledByEmployeeId: employee.employeeId,
    });
  });

  it('стикер сотрудника уходит кандидату как есть — строка `delivered`', async () => {
    const { applicationId, application, forumChatId, forumTopicId } = await createApplicationWithTopic();
    const employee = await createTestEmployee({ role: 'manager' });

    if (employee.telegramUserId === null) {
      throw new Error('фикстура сотрудника без Telegram');
    }

    const message: Message = {
      ...topicMessage({ forumChatId, forumTopicId, fromTelegramUserId: employee.telegramUserId, text: '' }),
      text: undefined,
      sticker: {
        file_id: 'sticker-file',
        file_unique_id: 'sticker-unique',
        type: 'regular',
        width: 512,
        height: 512,
        is_animated: false,
        is_video: false,
      },
    };

    expect(await relayEmployeeReply({ token: TOKEN, application, message, content: contentOf(message) })).toBe(
      'delivered',
    );

    const messages = await readTestCandidateMessages(applicationId);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      author: 'employee',
      kind: 'sticker',
      text: null,
      fileId: 'sticker-file',
      delivery: 'delivered',
      failure: null,
    });
  });

  it('сообщение в теме не от сотрудника в базу не пишется', async () => {
    const { applicationId, application, forumChatId, forumTopicId } = await createApplicationWithTopic();
    const message = topicMessage({
      forumChatId,
      forumTopicId,
      fromTelegramUserId: nextTestTelegramUserId(),
      text: 'Я тоже хочу ответить',
    });

    expect(await relayEmployeeReply({ token: TOKEN, application, message, content: contentOf(message) })).toBe(
      'not_employee',
    );
    expect(await readTestCandidateMessages(applicationId)).toHaveLength(0);
  });
});
