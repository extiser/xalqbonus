import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { text } from '#server/bot/texts';
import { advanceChatDraft, type ChatDraftMessage } from '#server/services/candidates/advanceChatDraft';
import type { CandidateMessageContent } from '#server/services/candidates/candidateMessageKind';
import type { ChatDraftReply, ChatReplyMarkup } from '#server/services/candidates/chatDraftReplies';
import { startChatDraft } from '#server/services/candidates/startChatDraft';
import { submitCandidateApplication } from '#server/services/candidates/submitCandidateApplication';
import { type ProfileLookupSummary, runProfileSyncByPhone } from '#server/services/sync/syncProfileByPhone';
import {
  cleanupTestCandidateApplications,
  readTestChatDraftMessages,
  readTestChatDrafts,
  readTestOpenApplications,
  trackTestCandidateTelegram,
} from '../support/candidates';
import { disconnectDatabase } from '../support/database';
import { cleanupTestEmployees, createTestEmployee, nextTestPhone, nextTestTelegramUserId } from '../support/employees';
import { cleanupTestPromoTouches, createTestPromoLink, nextTestPromoCode } from '../support/promo';

/**
 * Заявка кандидата в чате бота (issue #467) и номер сотрудника в заявке из Mini App.
 *
 * Покрыто то, что docs/infra.md → «Тесты» относит к исключениям:
 *
 * - **сырой SQL и повтор апдейта** — `/start` по метке начинает незаконченный черновик заново
 *   той же строкой (`ON CONFLICT … DO UPDATE` по частичному индексу), а повтор того же сообщения
 *   строки черновика не добавляет и шаг второй раз не двигает;
 * - **номер не `+998`** — вживую не воспроизвести: Telegram шлёт номер аккаунта;
 * - **доступ** — номер сотрудника заявку из Mini App не останавливает, Telegram сотрудника — да.
 *
 * Отправка в Telegram — заглушка `reply`: сервисы получают её параметром. Очередь темы
 * и поиск в Fleet API подменяются — заявка проверяется до них.
 */

vi.mock('#server/queues/candidates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#server/queues/candidates')>()),
  enqueueCandidateTopic: vi.fn(async () => undefined),
}));

vi.mock('#server/services/sync/syncProfileByPhone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#server/services/sync/syncProfileByPhone')>()),
  runProfileSyncByPhone: vi.fn(),
}));

/** 10-10-2026, полдень по Ташкенту. */
const NOW = new Date('2026-10-10T07:00:00.000Z');

/** Поиск в Fleet API, не нашедший номера. */
const NOTHING_IN_FLEET: ProfileLookupSummary = {
  runId: 'test-lookup',
  requests: 1,
  rateLimited: 0,
  profilesSeen: 0,
  profilesInserted: 0,
  profilesUpdated: 0,
  skippedWithoutLicense: 0,
  malformed: 0,
};

type SentReply = { text: string; replyMarkup: ChatReplyMarkup | null };

/** Заглушка отправки: запоминает ответы и выдаёт им `message_id`. */
const createReply = (): { sent: SentReply[]; reply: ChatDraftReply } => {
  const sent: SentReply[] = [];
  let lastMessageId = 5_000;

  return {
    sent,
    reply: async (messageText, replyMarkup) => {
      sent.push({ text: messageText, replyMarkup });
      lastMessageId += 1;

      return lastMessageId;
    },
  };
};

let lastCandidateMessageId = 100;

const nextCandidateMessageId = (): number => {
  lastCandidateMessageId += 1;

  return lastCandidateMessageId;
};

/** Сообщение кандидата в черновик: по умолчанию — текст. */
const draftMessage = (
  telegramUserId: bigint,
  input: { messageId?: number; content?: CandidateMessageContent; contact?: ChatDraftMessage['contact'] } = {},
): ChatDraftMessage => ({
  telegramUserId,
  telegramChatId: telegramUserId,
  telegramName: 'Азиз Каримов',
  telegramUsername: null,
  messageId: input.messageId ?? nextCandidateMessageId(),
  content: input.content ?? { kind: 'text', text: 'Здравствуйте', fileId: null },
  contact: input.contact ?? null,
});

/** Свой контакт, присланный кнопкой: `user_id` равен отправителю. */
const ownContact = (telegramUserId: bigint, phoneNumber: string): ChatDraftMessage =>
  draftMessage(telegramUserId, {
    content: { kind: 'contact', text: null, fileId: null },
    contact: { userId: telegramUserId, phoneNumber },
  });

/** Начинает черновик этого Telegram по метке — как `/start <код>`. */
const startDraft = async (
  telegramUserId: bigint,
  promoCode: string,
  reply: ChatDraftReply,
  language: 'ru' | 'uz' = 'ru',
) =>
  startChatDraft({
    telegramUserId,
    telegramChatId: telegramUserId,
    telegramName: 'Азиз Каримов',
    telegramUsername: null,
    promoCode,
    language,
    now: NOW,
    reply,
  });

const onlyDraft = async (telegramUserId: bigint) => {
  const drafts = await readTestChatDrafts(telegramUserId);
  const [draft] = drafts;

  if (drafts.length !== 1 || draft === undefined) {
    throw new Error(`черновиков у Telegram ${telegramUserId} — ${drafts.length}, а ждали один`);
  }

  return draft;
};

const newCandidate = (): bigint => {
  const telegramUserId = nextTestTelegramUserId();

  trackTestCandidateTelegram(telegramUserId);

  return telegramUserId;
};

afterAll(async () => {
  await disconnectDatabase();
});

describe('заявка в чате бота: черновик', () => {
  afterEach(async () => {
    await cleanupTestCandidateApplications();
  });

  it('`/start` начинает черновик и просит номер кнопкой', async () => {
    const telegramUserId = newCandidate();
    const { sent, reply } = createReply();

    expect(await startDraft(telegramUserId, nextTestPromoCode(), reply)).toBe('started');

    expect(sent).toHaveLength(1);
    expect(sent[0]?.text).toContain('Нажмите «Отправить номер» внизу.');
    expect(sent[0]?.replyMarkup).toEqual({
      keyboard: [[{ text: text('button_send_phone', 'ru'), request_contact: true }]],
      resize_keyboard: true,
      is_persistent: true,
    });
    expect(await onlyDraft(telegramUserId)).toMatchObject({ step: 'awaiting_contact', applicationId: null });
  });

  it('`/start` заново обновляет незаконченный черновик: второго нет, номер стёрт, метка и язык — новые', async () => {
    const telegramUserId = newCandidate();
    const { sent, reply } = createReply();
    const firstCode = nextTestPromoCode();
    const secondCode = nextTestPromoCode();

    await startDraft(telegramUserId, firstCode, reply);

    const draft = await onlyDraft(telegramUserId);

    expect(await advanceChatDraft({ draftId: draft.id, message: ownContact(telegramUserId, nextTestPhone()), now: NOW, reply })).toBe(
      'awaiting_name',
    );
    expect((await onlyDraft(telegramUserId)).step).toBe('awaiting_name');

    await startDraft(telegramUserId, secondCode, reply, 'uz');

    expect(await onlyDraft(telegramUserId)).toMatchObject({
      id: draft.id,
      promoCode: secondCode,
      language: 'uz',
      step: 'awaiting_contact',
      phoneRaw: null,
      phoneE164: null,
      applicationId: null,
    });
    // Второе начало — на языке нового `/start`, с кнопкой.
    expect(sent.at(-1)?.text).toContain('«Raqamni yuborish»');
  });

  it('повтор апдейта: то же сообщение второй раз строку не добавляет и не отвечает', async () => {
    const telegramUserId = newCandidate();
    const { sent, reply } = createReply();

    await startDraft(telegramUserId, nextTestPromoCode(), reply);

    const draft = await onlyDraft(telegramUserId);
    const message = draftMessage(telegramUserId);

    expect(await advanceChatDraft({ draftId: draft.id, message, now: NOW, reply })).toBe('use_button');
    expect(await advanceChatDraft({ draftId: draft.id, message, now: NOW, reply })).toBe('duplicate');

    expect(await readTestChatDraftMessages(draft.id)).toMatchObject([
      { kind: 'text', text: 'Здравствуйте', candidateMessageId: message.messageId },
    ]);
    expect(sent.map((answer) => answer.text)).toEqual([sent[0]?.text, text('application_chat_use_button', 'ru')]);
  });

  it('свой номер не `+998` — ответ про узбекский номер, кнопка остаётся, шаг тот же', async () => {
    const telegramUserId = newCandidate();
    const { sent, reply } = createReply();

    await startDraft(telegramUserId, nextTestPromoCode(), reply);

    const draft = await onlyDraft(telegramUserId);

    expect(await advanceChatDraft({ draftId: draft.id, message: ownContact(telegramUserId, '+79161234567'), now: NOW, reply })).toBe(
      'phone_not_uz',
    );

    const answer = sent.at(-1);

    // Телефон офиса в тексте — если в базе есть живой офис с телефоном; начало одно у обоих текстов.
    expect(answer?.text.startsWith(text('application_chat_phone_not_uz_no_office', 'ru'))).toBe(true);
    expect(answer?.replyMarkup).toMatchObject({ keyboard: [[{ request_contact: true }]] });
    expect(await onlyDraft(telegramUserId)).toMatchObject({ step: 'awaiting_contact', phoneE164: null });
  });

  it('чужой контакт — «это не ваш номер», шаг тот же', async () => {
    const telegramUserId = newCandidate();
    const { sent, reply } = createReply();

    await startDraft(telegramUserId, nextTestPromoCode(), reply);

    const draft = await onlyDraft(telegramUserId);
    const message = draftMessage(telegramUserId, {
      content: { kind: 'contact', text: null, fileId: null },
      contact: { userId: nextTestTelegramUserId(), phoneNumber: nextTestPhone() },
    });

    expect(await advanceChatDraft({ draftId: draft.id, message, now: NOW, reply })).toBe('contact_not_own');
    expect(sent.at(-1)?.text).toBe(text('application_chat_contact_not_own', 'ru'));
    expect((await onlyDraft(telegramUserId)).step).toBe('awaiting_contact');
  });
});

describe('заявка из Mini App: номер сотрудника', () => {
  afterEach(async () => {
    await cleanupTestCandidateApplications();
    await cleanupTestPromoTouches();
    await cleanupTestEmployees();
  });

  // Номера сотрудника в реестре парка нет — сверка идёт в Fleet API, а тот номера не знает.
  beforeEach(() => {
    vi.mocked(runProfileSyncByPhone).mockResolvedValue(NOTHING_IN_FLEET);
  });

  /** Заявка с номером, введённым руками на старом Telegram, по ссылке метки рекламы. */
  const submitManual = async (telegramUserId: bigint, promoCode: string, phoneE164: string) =>
    submitCandidateApplication({
      launch: {
        user: {
          id: telegramUserId,
          firstName: 'Азиз',
          lastName: '',
          username: '',
          languageCode: 'ru',
          allowsWriteToPrivateMessages: false,
        },
        startParam: promoCode,
        authDate: NOW,
      },
      name: 'Азиз',
      contactData: null,
      manualPhone: phoneE164.slice(4),
      writeAccessGranted: false,
      language: 'ru',
      botToken: 'test-token',
      appOrigin: 'http://localhost:3003',
      now: NOW,
    });

  it('номер сотрудника с Telegram не сотрудника — заявка заводится', async () => {
    const code = nextTestPromoCode();
    const employee = await createTestEmployee({ role: 'manager' });
    const telegramUserId = newCandidate();

    await createTestPromoLink(code, NOW, 'telegram_ad');

    expect(await submitManual(telegramUserId, code, employee.phoneE164)).toMatchObject({ outcome: 'accepted' });
    expect(await readTestOpenApplications(telegramUserId)).toMatchObject([
      { phoneE164: employee.phoneE164, phoneSource: 'manual', channel: 'miniapp' },
    ]);
  });

  it('Telegram сотрудника — отказ `employee`, заявки нет', async () => {
    const code = nextTestPromoCode();
    const employee = await createTestEmployee({ role: 'manager' });

    if (employee.telegramUserId === null) {
      throw new Error('фикстура сотрудника завелась без Telegram');
    }

    trackTestCandidateTelegram(employee.telegramUserId);
    await createTestPromoLink(code, NOW, 'telegram_ad');

    await expect(submitManual(employee.telegramUserId, code, nextTestPhone())).rejects.toMatchObject({
      code: 'employee',
    });
    expect(await readTestOpenApplications(employee.telegramUserId)).toEqual([]);
  });
});
