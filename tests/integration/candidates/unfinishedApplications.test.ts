import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { advanceChatDraft } from '#server/services/candidates/advanceChatDraft';
import { countWaitingApplications } from '#server/services/candidates/countWaitingApplications';
import { dismissUnfinished } from '#server/services/candidates/dismissUnfinished';
import { listApplications } from '#server/services/candidates/listApplications';
import { listUnfinished } from '#server/services/candidates/listUnfinished';
import { readApplicationCard } from '#server/services/candidates/readApplicationCard';
import { readUnfinishedCard } from '#server/services/candidates/readUnfinishedCard';
import { replyToDraft } from '#server/services/candidates/replyToDraft';
import { startChatDraft } from '#server/services/candidates/startChatDraft';
import { formatPhone } from '#shared/phone';
import {
  cleanupTestCandidateApplications,
  insertTestCandidateApplication,
  insertTestChatDraft,
  insertTestDraftMessage,
  readTestChatDraft,
  readTestChatDraftMessages,
  setTestDraftPhoneMessage,
} from '../support/candidates';
import { cleanupTestData, createTestPerson, disconnectDatabase } from '../support/database';
import {
  cleanupTestEmployees,
  createTestEmployee,
  linkTestDriver,
  nextTestPhone,
  nextTestTelegramUserId,
} from '../support/employees';
import { cleanupTestPromoTouches, createTestPromoLink, nextTestPromoCode } from '../support/promo';
import { disconnectQueues } from '../support/queues';

/**
 * «Не закончили» в заявках (issue #475).
 *
 * Покрыто то, что docs/infra.md → «Тесты» относит к исключениям:
 *
 * - **сырой SQL** — список с порядком трёх групп, правилами «виден» и «ждёт ответа», поиском;
 *   плитки и число у пилюли в запросе итогов заявок; каждый запрос — через сервис, которым его
 *   читает ручка, в настоящую базу;
 * - **возврат в список** — убранного возвращают новый `/start` и сообщение в черновик;
 * - **ответ из админки** — после доставки ведёт автор, второй ответ ведущего не меняет;
 *   закончившийся черновик — отказ без строки;
 * - **переписка до заявки** — `draftMessages` в карточке заявки.
 *
 * Список читает все черновики базы, поэтому строки теста отбираются поиском по общему для теста
 * имени из Telegram, а плитки сверяются приростом. Отправка в Telegram не подменяется: получатели
 * фикстур — отрицательные ID вне `TG_OUTGOING_ALLOWLIST`, и адаптер заглушает отправку сам.
 */

const MINUTE_MS = 60 * 1_000;
const HOUR_MS = 60 * MINUTE_MS;

const minutesAgo = (now: Date, minutes: number): Date => new Date(now.getTime() - minutes * MINUTE_MS);
const hoursAgo = (now: Date, hours: number): Date => new Date(now.getTime() - hours * HOUR_MS);

let lastNameTag = 0;

/** Имя из Telegram, общее для черновиков одного теста: по нему поиск отбирает только их. */
const nextNameTag = (): string => {
  lastNameTag += 1;

  return `Тестчерновик${Date.now().toString(36)}${lastNameTag}`;
};

const createDraft = async (input: {
  name: string;
  startedAt: Date;
  telegramUsername?: string;
  phoneE164?: string;
  promoCode?: string;
  telegramUserId?: bigint;
  applicationId?: string;
}): Promise<string> => {
  const { draftId } = await insertTestChatDraft({
    telegramUserId: input.telegramUserId ?? nextTestTelegramUserId(),
    promoCode: input.promoCode ?? nextTestPromoCode(),
    startedAt: input.startedAt,
    telegramName: input.name,
    telegramUsername: input.telegramUsername ?? null,
    phoneE164: input.phoneE164,
    applicationId: input.applicationId,
  });

  return draftId;
};

const unfinishedIds = async (query: string, now: Date): Promise<string[]> =>
  (await listUnfinished({ query, offset: 0, now })).rows.map((row) => row.id);

/** Ответ бота в черновике — заглушка: тестам «Не закончили» он не важен. */
const silentReply = async (): Promise<number> => 1;

describe('«Не закончили» в заявках', () => {
  afterEach(async () => {
    // Черновики — до сотрудников: ответы и «убрал» ссылаются на учётку с `RESTRICT`.
    await cleanupTestCandidateApplications();
    await cleanupTestPromoTouches();
    await cleanupTestEmployees();
    await cleanupTestData();
  });

  afterAll(async () => {
    await disconnectDatabase();
    await disconnectQueues();
  });

  describe('список', () => {
    it('ждут ответа — дольше всех первыми, потом кому не писали, потом кому писали; свежие первыми', async () => {
      const now = new Date();
      const tag = nextNameTag();
      const employee = await createTestEmployee({ role: 'owner' });
      const create = (letter: string, startedHours: number) =>
        createDraft({ name: `${tag} ${letter}`, startedAt: hoursAgo(now, startedHours) });

      const ids = {
        // Написал 5 ч назад, никто не ответил.
        W1: await create('W1', 6),
        // Написал 30 мин назад — в списке сразу, хотя `/start` меньше часа назад.
        W2: await createDraft({ name: `${tag} W2`, startedAt: minutesAgo(now, 40) }),
        // Написал 3 ч назад, ответ сотрудника не дошёл — ждёт.
        D: await create('D', 4),
        // Молчит.
        B: await create('B', 2),
        // Прислал только контакт: это шаг заявки, не вопрос.
        C: await create('C', 5),
        // Написал, ему ответили.
        A: await create('A', 3),
        E: await create('E', 10),
      };
      const employeeId = employee.employeeId;

      await insertTestDraftMessage({ draftId: ids.W1, author: 'person', createdAt: hoursAgo(now, 5) });
      await insertTestDraftMessage({ draftId: ids.W2, author: 'person', createdAt: minutesAgo(now, 30) });
      await insertTestDraftMessage({ draftId: ids.D, author: 'person', createdAt: hoursAgo(now, 3) });
      await insertTestDraftMessage({ draftId: ids.D, author: 'employee', employeeId, delivery: 'failed', createdAt: hoursAgo(now, 2) });
      await insertTestDraftMessage({ draftId: ids.C, author: 'person', kind: 'contact', createdAt: hoursAgo(now, 4) });
      await insertTestDraftMessage({ draftId: ids.A, author: 'person', createdAt: hoursAgo(now, 2) });
      await insertTestDraftMessage({ draftId: ids.A, author: 'employee', employeeId, createdAt: hoursAgo(now, 1) });
      await insertTestDraftMessage({ draftId: ids.E, author: 'person', createdAt: hoursAgo(now, 9) });
      await insertTestDraftMessage({ draftId: ids.E, author: 'employee', employeeId, createdAt: hoursAgo(now, 8) });

      const list = await listUnfinished({ query: tag, offset: 0, now });

      expect(list.rows.map((row) => row.id)).toEqual([ids.W1, ids.D, ids.W2, ids.B, ids.C, ids.A, ids.E]);
      expect(list.total).toBe(7);

      const byId = new Map(list.rows.map((row) => [row.id, row]));

      expect(byId.get(ids.W1)?.waitingSince).toBe(hoursAgo(now, 5).toISOString());
      expect(byId.get(ids.D)?.waitingSince).toBe(hoursAgo(now, 3).toISOString());

      for (const id of [ids.B, ids.C, ids.A, ids.E]) {
        expect(byId.get(id)?.waitingSince).toBeNull();
      }
    });

    it('молчащий виден через час после `/start` и не раньше', async () => {
      const now = new Date();
      const tag = nextNameTag();
      const draftId = await createDraft({ name: tag, startedAt: minutesAgo(now, 59) });

      expect(await unfinishedIds(tag, now)).toEqual([]);
      expect(await unfinishedIds(tag, new Date(now.getTime() + 2 * MINUTE_MS))).toEqual([draftId]);
    });

    it('доставленный ответ снимает ожидание, недоставленный — нет', async () => {
      const now = new Date();
      const tag = nextNameTag();
      const employee = await createTestEmployee({ role: 'owner' });
      const draftId = await createDraft({ name: tag, startedAt: minutesAgo(now, 20) });

      await insertTestDraftMessage({ draftId, author: 'person', createdAt: minutesAgo(now, 10) });
      await insertTestDraftMessage({
        draftId,
        author: 'employee',
        employeeId: employee.employeeId,
        delivery: 'failed',
        createdAt: minutesAgo(now, 5),
      });

      expect((await listUnfinished({ query: tag, offset: 0, now })).rows[0]?.waitingSince).toBe(
        minutesAgo(now, 10).toISOString(),
      );

      await insertTestDraftMessage({ draftId, author: 'employee', employeeId: employee.employeeId, createdAt: minutesAgo(now, 4) });

      // Ответили, а `/start` меньше часа назад — молчащий, и в списке его ещё нет.
      expect(await unfinishedIds(tag, now)).toEqual([]);
    });

    it('убранный, закончивший заявкой, участник программы и сотрудник не видны', async () => {
      const now = new Date();
      const tag = nextNameTag();
      const employee = await createTestEmployee({ role: 'manager' });
      const started = hoursAgo(now, 3);

      const visible = await createDraft({ name: `${tag} видно`, startedAt: started });
      const dismissed = await createDraft({ name: `${tag} убран`, startedAt: started });
      await insertTestDraftMessage({ draftId: dismissed, author: 'person', createdAt: hoursAgo(now, 2) });
      await dismissUnfinished({ draftId: dismissed, employeeId: employee.employeeId });

      const applicationTelegram = nextTestTelegramUserId();
      const { applicationId } = await insertTestCandidateApplication({
        telegramUserId: applicationTelegram,
        promoCode: nextTestPromoCode(),
        phoneE164: nextTestPhone(),
        language: 'ru',
        writeAllowed: true,
        createdAt: hoursAgo(now, 1),
      });
      await createDraft({ name: `${tag} подал`, startedAt: started, telegramUserId: applicationTelegram, applicationId });

      const memberTelegram = nextTestTelegramUserId();
      const member = await createTestPerson({ inProgram: true });
      await createDraft({ name: `${tag} участник`, startedAt: started, telegramUserId: memberTelegram });
      await linkTestDriver(member.personId, memberTelegram);

      const employeeTelegram = nextTestTelegramUserId();
      await createDraft({ name: `${tag} сотрудник`, startedAt: started, telegramUserId: employeeTelegram });
      await createTestEmployee({ role: 'manager', telegramUserId: employeeTelegram });

      expect(await unfinishedIds(tag, now)).toEqual([visible]);
    });

    it('поиск — по имени из Telegram, по @имени и по цифрам номера', async () => {
      const now = new Date();
      const tag = nextNameTag();
      const phoneE164 = nextTestPhone();
      const started = hoursAgo(now, 2);
      const username = `user_${Date.now().toString(36)}`;

      const byNameId = await createDraft({ name: `${tag} Дилшод`, startedAt: started });
      const byUsernameId = await createDraft({ name: `${tag} Sherzod`, startedAt: started, telegramUsername: username });
      const byPhoneId = await createDraft({ name: `${tag} Ахрор`, startedAt: started, phoneE164 });

      expect(await unfinishedIds(`${tag} ДИЛШОД`.toLowerCase(), now)).toEqual([byNameId]);
      expect(await unfinishedIds(`@${username.toUpperCase()}`, now)).toEqual([byUsernameId]);
      expect(await unfinishedIds(username, now)).toEqual([byUsernameId]);

      // «+998 90 123-45-67» — поиск по хвосту номера в показном виде.
      const display = formatPhone(phoneE164).display;
      const found = await listUnfinished({ query: display.slice(4), offset: 0, now });

      expect(found.rows.map((row) => row.id)).toEqual([byPhoneId]);
      expect(found.rows[0]).toMatchObject({ step: 'awaiting_name', phone: display });
    });

    it('строка называет метку и того, кто ведёт', async () => {
      const now = new Date();
      const tag = nextNameTag();
      const promoCode = nextTestPromoCode();
      const owner = await createTestEmployee({ role: 'owner' });

      await createTestPromoLink(promoCode, hoursAgo(now, 100), 'telegram_ad', 'bot');

      const draftId = await createDraft({ name: tag, startedAt: hoursAgo(now, 2), promoCode, telegramUsername: 'dilshod' });

      await replyToDraft({ draftId, employeeId: owner.employeeId, text: 'Здравствуйте' });

      const [row] = (await listUnfinished({ query: tag, offset: 0, now })).rows;

      expect(row).toMatchObject({
        id: draftId,
        telegramName: tag,
        telegramUsername: 'dilshod',
        step: 'awaiting_contact',
        phone: null,
        promoName: `Тест ${promoCode}`,
        promoCode,
        startedAt: hoursAgo(now, 2).toISOString(),
        handledBy: 'Тестовый Сотрудник',
        waitingSince: null,
      });
    });

    it('плитки: «Ждут ответа» считает написавших сами, «Дольше суток» и счётчик меню — нет; пилюля — с поиском', async () => {
      const now = new Date();
      const tag = nextNameTag();
      const employee = await createTestEmployee({ role: 'manager' });
      const before = await listApplications({ filter: 'all', query: '', offset: 0, now });
      const waitingCountBefore = await countWaitingApplications();

      const wrote = await createDraft({ name: `${tag} написал`, startedAt: minutesAgo(now, 10) });
      const wroteLongAgo = await createDraft({ name: `${tag} давно`, startedAt: hoursAgo(now, 31) });
      await createDraft({ name: `${tag} молчит`, startedAt: hoursAgo(now, 2) });
      const dismissed = await createDraft({ name: `${tag} убран`, startedAt: hoursAgo(now, 2) });

      await insertTestDraftMessage({ draftId: wrote, author: 'person', createdAt: minutesAgo(now, 5) });
      await insertTestDraftMessage({ draftId: wroteLongAgo, author: 'person', createdAt: hoursAgo(now, 30) });
      await insertTestDraftMessage({ draftId: dismissed, author: 'person', createdAt: hoursAgo(now, 1) });
      await dismissUnfinished({ draftId: dismissed, employeeId: employee.employeeId });

      const after = await listApplications({ filter: 'all', query: tag, offset: 0, now });

      expect(after.tiles).toMatchObject({
        waiting: before.tiles.waiting + 2,
        waitingUnfinished: before.tiles.waitingUnfinished + 2,
        overdue: before.tiles.overdue,
      });
      expect(after.counts).toEqual({ all: 0, waiting: 0, new: 0, in_progress: 0, hired: 0, rejected: 0, unfinished: 3 });
      expect((await countWaitingApplications()).count).toBe(waitingCountBefore.count);
    });
  });

  describe('возврат в список', () => {
    it('убранный возвращается новым `/start`', async () => {
      const now = new Date();
      const tag = nextNameTag();
      const telegramUserId = nextTestTelegramUserId();
      const employee = await createTestEmployee({ role: 'manager' });
      const draftId = await createDraft({ name: tag, startedAt: hoursAgo(now, 5), telegramUserId });

      await dismissUnfinished({ draftId, employeeId: employee.employeeId });

      expect(await unfinishedIds(tag, now)).toEqual([]);

      await startChatDraft({
        telegramUserId,
        telegramChatId: telegramUserId,
        telegramName: tag,
        telegramUsername: null,
        promoCode: nextTestPromoCode(),
        language: 'ru',
        now: hoursAgo(now, 2),
        reply: silentReply,
      });

      expect(await readTestChatDraft(draftId)).toMatchObject({ dismissedAt: null, dismissedByEmployeeId: null });
      expect(await unfinishedIds(tag, now)).toEqual([draftId]);
    });

    it('убранный возвращается сообщением в черновик и сразу ждёт ответа', async () => {
      const now = new Date();
      const tag = nextNameTag();
      const telegramUserId = nextTestTelegramUserId();
      const employee = await createTestEmployee({ role: 'manager' });
      const draftId = await createDraft({ name: tag, startedAt: hoursAgo(now, 5), telegramUserId });

      await dismissUnfinished({ draftId, employeeId: employee.employeeId });

      expect(await unfinishedIds(tag, now)).toEqual([]);

      await advanceChatDraft({
        draftId,
        message: {
          telegramUserId,
          telegramChatId: telegramUserId,
          telegramName: tag,
          telegramUsername: null,
          messageId: 7,
          content: { kind: 'text', text: 'Можно на машине парка?', fileId: null },
          contact: null,
        },
        now,
        reply: silentReply,
      });

      const list = await listUnfinished({ query: tag, offset: 0, now: new Date() });

      expect(list.rows.map((row) => row.id)).toEqual([draftId]);
      expect(list.rows[0]?.waitingSince).not.toBeNull();
    });

    it('«Убрать из списка» у подавшего заявку — отказ, у убранного — без изменений', async () => {
      const now = new Date();
      const employee = await createTestEmployee({ role: 'manager' });
      const second = await createTestEmployee({ role: 'admin' });
      const telegramUserId = nextTestTelegramUserId();
      const { applicationId } = await insertTestCandidateApplication({
        telegramUserId,
        promoCode: nextTestPromoCode(),
        phoneE164: nextTestPhone(),
        language: 'ru',
        writeAllowed: true,
        createdAt: now,
      });
      const closed = await createDraft({ name: nextNameTag(), startedAt: hoursAgo(now, 2), telegramUserId, applicationId });
      const open = await createDraft({ name: nextNameTag(), startedAt: hoursAgo(now, 2) });

      await expect(dismissUnfinished({ draftId: closed, employeeId: employee.employeeId })).rejects.toMatchObject({
        code: 'draft_closed',
      });

      await dismissUnfinished({ draftId: open, employeeId: employee.employeeId });
      await expect(dismissUnfinished({ draftId: open, employeeId: second.employeeId })).resolves.toEqual({ dismissed: true });

      expect((await readTestChatDraft(open))?.dismissedByEmployeeId).toBe(employee.employeeId);
      expect((await readTestChatDraft(closed))?.dismissedAt).toBeNull();
    });
  });

  describe('ответ из админки', () => {
    it('доставлен — ведёт автор, ожидание снято; второй ответ ведущего не меняет', async () => {
      const now = new Date();
      const tag = nextNameTag();
      const owner = await createTestEmployee({ role: 'owner' });
      const admin = await createTestEmployee({ role: 'admin' });
      const draftId = await createDraft({ name: tag, startedAt: hoursAgo(now, 2) });

      await insertTestDraftMessage({ draftId, author: 'person', createdAt: hoursAgo(now, 1) });

      expect(await replyToDraft({ draftId, employeeId: owner.employeeId, text: 'Здравствуйте <b>Дилшод</b>' })).toEqual({
        delivery: 'delivered',
      });
      expect(await replyToDraft({ draftId, employeeId: admin.employeeId, text: 'Ждём номер' })).toEqual({
        delivery: 'delivered',
      });

      const draft = await readTestChatDraft(draftId);
      const messages = await readTestChatDraftMessages(draftId);

      expect(draft?.handledByEmployeeId).toBe(owner.employeeId);
      expect(draft?.step).toBe('awaiting_contact');
      expect(messages.map((message) => ({ author: message.author, employeeId: message.employeeId, text: message.text, delivery: message.delivery }))).toEqual([
        { author: 'person', employeeId: null, text: 'тест', delivery: 'delivered' },
        { author: 'employee', employeeId: owner.employeeId, text: 'Здравствуйте <b>Дилшод</b>', delivery: 'delivered' },
        { author: 'employee', employeeId: admin.employeeId, text: 'Ждём номер', delivery: 'delivered' },
      ]);
      expect((await listUnfinished({ query: tag, offset: 0, now: new Date() })).rows[0]?.waitingSince).toBeNull();
    });

    it('черновик закончен заявкой — отказ, строки нет', async () => {
      const owner = await createTestEmployee({ role: 'owner' });
      const telegramUserId = nextTestTelegramUserId();
      const { applicationId } = await insertTestCandidateApplication({
        telegramUserId,
        promoCode: nextTestPromoCode(),
        phoneE164: nextTestPhone(),
        language: 'ru',
        writeAllowed: true,
        createdAt: new Date(),
      });
      const draftId = await createDraft({ name: nextNameTag(), startedAt: new Date(), telegramUserId, applicationId });

      await expect(replyToDraft({ draftId, employeeId: owner.employeeId, text: 'Здравствуйте' })).rejects.toMatchObject({
        code: 'draft_closed',
      });

      expect(await readTestChatDraftMessages(draftId)).toEqual([]);
      expect((await readTestChatDraft(draftId))?.handledByEmployeeId).toBeNull();
    });
  });

  describe('карточки', () => {
    it('карточка черновика: номер, контакт номера, ожидание и ответ — по роли', async () => {
      const now = new Date();
      const phoneE164 = nextTestPhone();
      const draftId = await createDraft({ name: nextNameTag(), startedAt: hoursAgo(now, 20), phoneE164 });
      const { messageId: contactId } = await insertTestDraftMessage({
        draftId,
        author: 'person',
        kind: 'contact',
        createdAt: hoursAgo(now, 19),
      });

      await setTestDraftPhoneMessage(draftId, contactId);
      await insertTestDraftMessage({ draftId, author: 'person', createdAt: hoursAgo(now, 5) });

      const card = await readUnfinishedCard({ draftId, viewerRole: 'manager' });

      if (!('draft' in card)) {
        throw new Error('карточка незаконченного черновика ушла в заявку');
      }

      expect(card.draft).toMatchObject({
        id: draftId,
        step: 'awaiting_name',
        phone: formatPhone(phoneE164).display,
        phoneAt: hoursAgo(now, 19).toISOString(),
        waitingSince: hoursAgo(now, 5).toISOString(),
        handledBy: null,
        dismissed: false,
      });
      expect(card.messages.map((message) => ({ kind: message.kind, isPhoneMessage: message.isPhoneMessage }))).toEqual([
        { kind: 'contact', isPhoneMessage: true },
        { kind: 'text', isPhoneMessage: false },
      ]);
      expect(card.canReply).toBe(false);
      expect(await readUnfinishedCard({ draftId, viewerRole: 'admin' })).toMatchObject({ canReply: true });
    });

    it('у заявки из черновика — его сообщения до подачи, у заявки из Mini App — пусто', async () => {
      const now = new Date();
      const promoCode = nextTestPromoCode();
      const phoneE164 = nextTestPhone();
      const owner = await createTestEmployee({ role: 'owner' });

      await createTestPromoLink(promoCode, hoursAgo(now, 100), 'telegram_ad', 'bot');

      const telegramUserId = nextTestTelegramUserId();
      const { applicationId } = await insertTestCandidateApplication({
        telegramUserId,
        promoCode,
        phoneE164,
        language: 'ru',
        writeAllowed: true,
        createdAt: now,
      });
      const draftId = await createDraft({
        name: nextNameTag(),
        startedAt: hoursAgo(now, 3),
        telegramUserId,
        phoneE164,
        promoCode,
        applicationId,
      });
      const { messageId: contactId } = await insertTestDraftMessage({
        draftId,
        author: 'person',
        kind: 'contact',
        createdAt: hoursAgo(now, 2),
      });

      await setTestDraftPhoneMessage(draftId, contactId);
      await insertTestDraftMessage({ draftId, author: 'employee', employeeId: owner.employeeId, createdAt: hoursAgo(now, 1) });

      const card = await readApplicationCard({ applicationId, viewerRole: 'owner' });

      expect(card.draftMessages.map((message) => ({
        author: message.author,
        authorName: message.authorName,
        kind: message.kind,
        isPhoneMessage: message.isPhoneMessage,
        startedAt: message.startedAt,
        promoName: message.promoName,
        phone: message.phone,
      }))).toEqual([
        {
          author: 'person',
          authorName: null,
          kind: 'contact',
          isPhoneMessage: true,
          startedAt: hoursAgo(now, 3).toISOString(),
          promoName: `Тест ${promoCode}`,
          phone: formatPhone(phoneE164).display,
        },
        {
          author: 'employee',
          authorName: 'Тестовый Сотрудник',
          kind: 'text',
          isPhoneMessage: false,
          startedAt: hoursAgo(now, 3).toISOString(),
          promoName: `Тест ${promoCode}`,
          phone: formatPhone(phoneE164).display,
        },
      ]);

      expect(await readUnfinishedCard({ draftId, viewerRole: 'owner' })).toEqual({ applicationId });

      const { applicationId: miniAppId } = await insertTestCandidateApplication({
        telegramUserId: nextTestTelegramUserId(),
        promoCode,
        phoneE164: nextTestPhone(),
        language: 'ru',
        writeAllowed: true,
        createdAt: now,
      });

      expect((await readApplicationCard({ applicationId: miniAppId, viewerRole: 'owner' })).draftMessages).toEqual([]);
    });
  });
});
