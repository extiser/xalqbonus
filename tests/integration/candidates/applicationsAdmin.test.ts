import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { listAdParticipants } from '#server/services/candidates/listAdParticipants';
import { listApplications } from '#server/services/candidates/listApplications';
import { countWaitingApplications } from '#server/services/candidates/countWaitingApplications';
import { markApplicationStatus } from '#server/services/candidates/markApplicationStatus';
import { readApplicationCard } from '#server/services/candidates/readApplicationCard';
import { replyFromAdmin } from '#server/services/candidates/replyFromAdmin';
import { APPLICATIONS_PAGE_SIZE } from '#shared/candidateApplications';
import { formatPhone } from '#shared/phone';
import {
  cleanupTestCandidateApplications,
  insertTestApplicationEvent,
  insertTestCandidateApplication,
  insertTestCandidateMessage,
  insertTestOpenChatDraft,
  readTestApplicationEvents,
  readTestChatDrafts,
  readTestCandidateApplication,
  readTestCandidateMessages,
  setTestFormerLinkPerson,
} from '../support/candidates';
import { cleanupTestData, createTestPerson, createTestTrip, disconnectDatabase } from '../support/database';
import { cleanupTestEmployees, createTestEmployee, nextTestPhone, nextTestTelegramUserId } from '../support/employees';
import {
  cleanupTestPromoTouches,
  createTestPromoLink,
  insertTestPromoTouch,
  markTestPersonDemo,
  nextTestPromoCode,
} from '../support/promo';
import { disconnectQueues } from '../support/queues';

/**
 * Раздел «Заявки» админки (issue #471).
 *
 * Покрыто то, что docs/infra.md → «Тесты» относит к исключениям:
 *
 * - **сырой SQL** — список с порядком трёх групп и фильтром, плитки и счётчики пилюль, поиск,
 *   счётчик меню и таблица «Участники программы, пришли по рекламе»; каждый запрос — через
 *   сервис, которым его читает ручка, в настоящую базу;
 * - **переходы статуса** — разрешённые проходят и пишут журнал, остальные — отказ;
 * - **ответ из админки** — после доставки заявка в работе и её ведёт автор; без права писать
 *   строки нет.
 *
 * Список читает все заявки базы, поэтому строки теста отбираются поиском по общему для теста
 * имени, а плитки сверяются приростом. Отправка в Telegram не подменяется: получатели фикстур —
 * отрицательные ID вне `TG_OUTGOING_ALLOWLIST`, и адаптер заглушает отправку сам.
 */

const HOUR_MS = 60 * 60 * 1_000;

const hoursAgo = (now: Date, hours: number): Date => new Date(now.getTime() - hours * HOUR_MS);

let lastNameTag = 0;

/** Имя, общее для заявок одного теста: по нему поиск отбирает только их. */
const nextNameTag = (): string => {
  lastNameTag += 1;

  return `Тестзаявка${Date.now().toString(36)}${lastNameTag}`;
};

const createApplication = async (input: {
  name: string;
  status?: 'new' | 'in_progress' | 'hired' | 'rejected';
  createdAt: Date;
  writeAllowed?: boolean;
  phoneE164?: string;
  forumChatId?: bigint;
  forumTopicId?: number;
}): Promise<string> => {
  const telegramUserId = nextTestTelegramUserId();
  const { applicationId } = await insertTestCandidateApplication({
    telegramUserId,
    promoCode: nextTestPromoCode(),
    phoneE164: input.phoneE164 ?? nextTestPhone(),
    language: 'ru',
    writeAllowed: input.writeAllowed ?? true,
    createdAt: input.createdAt,
    name: input.name,
    status: input.status,
    forumChatId: input.forumChatId,
    forumTopicId: input.forumTopicId,
  });

  return applicationId;
};

describe('раздел «Заявки»', () => {
  afterEach(async () => {
    // Заявки — до сотрудников: переписка и журнал ссылаются на учётку с `RESTRICT`.
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
    /**
     * Восемь заявок, по две-три на каждое правило:
     *
     * - ждут ответа: C — с подачи 30 ч, дольше суток; A — с подачи 3 ч; E — с подачи 2 ч,
     *   после неё писал только бот; B — кандидат написал 1 ч назад после ответа сотрудника;
     * - в работе без ожидания: D — сотрудник ответил после подачи; H — после сообщения
     *   кандидата стоит отметка;
     * - закрытые: G — отказ час назад, F — оформлен 50 ч назад.
     */
    const seed = async (now: Date) => {
      const tag = nextNameTag();
      const employee = await createTestEmployee({ role: 'manager' });
      const create = (letter: string, status: 'new' | 'in_progress' | 'hired' | 'rejected', hours: number) =>
        createApplication({ name: `${tag} ${letter}`, status, createdAt: hoursAgo(now, hours) });

      const ids = {
        A: await create('A', 'new', 3),
        B: await create('B', 'in_progress', 10),
        C: await create('C', 'new', 30),
        D: await create('D', 'in_progress', 5),
        E: await create('E', 'new', 2),
        F: await create('F', 'hired', 50),
        G: await create('G', 'rejected', 1),
        H: await create('H', 'in_progress', 7),
      };

      const employeeId = employee.employeeId;

      await insertTestCandidateMessage({ applicationId: ids.B, author: 'employee', employeeId, delivery: 'delivered', createdAt: hoursAgo(now, 9) });
      await insertTestCandidateMessage({ applicationId: ids.B, author: 'candidate', delivery: 'failed', createdAt: hoursAgo(now, 1) });
      await insertTestCandidateMessage({ applicationId: ids.D, author: 'employee', employeeId, delivery: 'delivered', createdAt: hoursAgo(now, 4) });
      // Ответ сотрудника, который не дошёл, ответом не считается.
      await insertTestCandidateMessage({ applicationId: ids.A, author: 'employee', employeeId, delivery: 'failed', createdAt: hoursAgo(now, 2) });
      await insertTestCandidateMessage({ applicationId: ids.E, author: 'bot', delivery: 'delivered', createdAt: hoursAgo(now, 1) });
      await insertTestCandidateMessage({ applicationId: ids.H, author: 'candidate', delivery: 'delivered', createdAt: hoursAgo(now, 6) });
      await insertTestApplicationEvent({ applicationId: ids.H, kind: 'reopened', employeeId, createdAt: hoursAgo(now, 5) });
      await insertTestApplicationEvent({ applicationId: ids.F, kind: 'hired', employeeId, createdAt: hoursAgo(now, 49) });

      return { tag, ids };
    };

    it('ждущие первыми, дольше всех сверху, потом остальные в работе, закрытые в конце', async () => {
      const now = new Date();
      const { tag, ids } = await seed(now);

      const list = await listApplications({ filter: 'all', query: tag, offset: 0, now });

      expect(list.rows.map((row) => row.id)).toEqual([ids.C, ids.A, ids.E, ids.B, ids.D, ids.H, ids.G, ids.F]);
      expect(list.total).toBe(8);
      expect(list.limit).toBe(APPLICATIONS_PAGE_SIZE);

      const byId = new Map(list.rows.map((row) => [row.id, row]));

      expect(byId.get(ids.C)).toMatchObject({ waitingFrom: 'submitted', waitingSince: hoursAgo(now, 30).toISOString() });
      expect(byId.get(ids.A)).toMatchObject({ waitingFrom: 'submitted' });
      expect(byId.get(ids.E)).toMatchObject({ waitingFrom: 'submitted' });
      expect(byId.get(ids.B)).toMatchObject({ waitingFrom: 'candidate', waitingSince: hoursAgo(now, 1).toISOString() });

      for (const id of [ids.D, ids.H, ids.G, ids.F]) {
        expect(byId.get(id)).toMatchObject({ waitingSince: null, waitingFrom: null });
      }
    });

    it('фильтр «Ждут ответа» — только первая группа, статус — по статусу тем же порядком', async () => {
      const now = new Date();
      const { tag, ids } = await seed(now);

      const waiting = await listApplications({ filter: 'waiting', query: tag, offset: 0, now });

      expect(waiting.rows.map((row) => row.id)).toEqual([ids.C, ids.A, ids.E, ids.B]);
      expect(waiting.total).toBe(4);

      const inProgress = await listApplications({ filter: 'in_progress', query: tag, offset: 0, now });

      expect(inProgress.rows.map((row) => row.id)).toEqual([ids.B, ids.D, ids.H]);
    });

    it('пилюли считают с поиском, плитки — по всем заявкам', async () => {
      const now = new Date();
      const before = await listApplications({ filter: 'all', query: '', offset: 0, now });
      const waitingBefore = await countWaitingApplications();
      const { tag } = await seed(now);

      const after = await listApplications({ filter: 'all', query: tag, offset: 0, now });

      expect(after.counts).toEqual({ all: 8, waiting: 4, new: 3, in_progress: 3, hired: 1, rejected: 1, unfinished: 0 });
      expect(after.tiles).toEqual({
        waiting: before.tiles.waiting + 4,
        waitingUnfinished: before.tiles.waitingUnfinished,
        overdue: before.tiles.overdue + 1,
        total: before.tiles.total + 8,
        totalWeek: before.tiles.totalWeek + 8,
        hired: before.tiles.hired + 1,
        hiredWeek: before.tiles.hiredWeek + 1,
      });
      expect((await countWaitingApplications()).count).toBe(waitingBefore.count + 4);
    });

    it('листание режет страницу смещением, всего — под фильтром', async () => {
      const now = new Date();
      const { tag, ids } = await seed(now);

      const all = await listApplications({ filter: 'all', query: tag, offset: 6, now });

      expect(all.rows.map((row) => row.id)).toEqual([ids.G, ids.F]);
      expect(all.total).toBe(8);
      expect(all.offset).toBe(6);
    });

    it('поиск — по имени без учёта регистра и по цифрам номера с разделителями', async () => {
      const now = new Date();
      const tag = nextNameTag();
      const phoneE164 = nextTestPhone();
      const found = await createApplication({ name: `${tag} Нодира`, createdAt: now, phoneE164 });
      await createApplication({ name: `${tag} Камола`, createdAt: now });

      const byName = await listApplications({ filter: 'all', query: `${tag} НОДИРА`.toLowerCase(), offset: 0, now });

      expect(byName.rows.map((row) => row.id)).toEqual([found]);

      // «+998 90 123-45-67» — поиск по хвосту номера в показном виде.
      const display = formatPhone(phoneE164).display;
      const byPhone = await listApplications({ filter: 'all', query: display.slice(8), offset: 0, now });

      expect(byPhone.rows.map((row) => row.id)).toContain(found);
      expect(byPhone.rows.every((row) => row.phone.replace(/\D/g, '').includes(display.slice(8).replace(/\D/g, '')))).toBe(true);
    });

    it('строка называет бывшего водителя этого Telegram', async () => {
      const now = new Date();
      const tag = nextNameTag();
      const person = await createTestPerson({ inProgram: true });
      const applicationId = await createApplication({ name: tag, createdAt: now });

      await setTestFormerLinkPerson(applicationId, person.personId);

      const list = await listApplications({ filter: 'all', query: tag, offset: 0, now });

      expect(list.rows[0]).toMatchObject({
        id: applicationId,
        telegramWasMember: true,
        formerDriverName: 'Тестов Тест',
      });
    });
  });

  describe('переходы статуса', () => {
    it('разрешённые проходят, пишут журнал и ставят ведущего', async () => {
      const employee = await createTestEmployee({ role: 'manager' });
      const second = await createTestEmployee({ role: 'senior_manager' });
      const applicationId = await createApplication({ name: nextNameTag(), createdAt: new Date() });

      await markApplicationStatus({ applicationId, status: 'hired', employeeId: employee.employeeId });
      await markApplicationStatus({ applicationId, status: 'in_progress', employeeId: second.employeeId });
      await markApplicationStatus({ applicationId, status: 'rejected', employeeId: second.employeeId });
      await markApplicationStatus({ applicationId, status: 'in_progress', employeeId: second.employeeId });

      const application = await readTestCandidateApplication(applicationId);
      const events = await readTestApplicationEvents(applicationId);

      expect(application?.status).toBe('in_progress');
      // Ведёт первый, кто поставил отметку: следующие отметки ведущего не меняют.
      expect(application?.handledByEmployeeId).toBe(employee.employeeId);
      expect(events.map((event) => event.kind)).toEqual(['hired', 'reopened', 'rejected', 'reopened']);
    });

    it('«Оформлен» второй раз и «Новая» → «В работе» отметкой — отказ, журнал не пишется', async () => {
      const employee = await createTestEmployee({ role: 'manager' });
      const hiredId = await createApplication({ name: nextNameTag(), status: 'hired', createdAt: new Date() });
      const newId = await createApplication({ name: nextNameTag(), createdAt: new Date() });

      await expect(
        markApplicationStatus({ applicationId: hiredId, status: 'hired', employeeId: employee.employeeId }),
      ).rejects.toMatchObject({ code: 'status_transition_invalid' });
      await expect(
        markApplicationStatus({ applicationId: newId, status: 'in_progress', employeeId: employee.employeeId }),
      ).rejects.toMatchObject({ code: 'status_transition_invalid' });

      expect(await readTestApplicationEvents(hiredId)).toEqual([]);
      expect(await readTestApplicationEvents(newId)).toEqual([]);
      expect((await readTestCandidateApplication(newId))?.status).toBe('new');
    });

    it('вернуть в работу при другой открытой заявке того же Telegram — отказ, статус и журнал прежние', async () => {
      const employee = await createTestEmployee({ role: 'manager' });
      const telegramUserId = nextTestTelegramUserId();
      const insert = async (status: 'rejected' | 'new') =>
        (
          await insertTestCandidateApplication({
            telegramUserId,
            promoCode: nextTestPromoCode(),
            phoneE164: nextTestPhone(),
            language: 'ru',
            writeAllowed: true,
            createdAt: new Date(),
            name: nextNameTag(),
            status,
          })
        ).applicationId;
      const rejectedId = await insert('rejected');
      await insert('new');

      await expect(
        markApplicationStatus({ applicationId: rejectedId, status: 'in_progress', employeeId: employee.employeeId }),
      ).rejects.toMatchObject({ code: 'open_application_exists' });

      expect((await readTestCandidateApplication(rejectedId))?.status).toBe('rejected');
      expect((await readTestCandidateApplication(rejectedId))?.handledByEmployeeId).toBeNull();
      expect(await readTestApplicationEvents(rejectedId)).toEqual([]);
    });

    it('вернуть в работу при открытой заявке на тот же номер из Telegram с другого Telegram — отказ', async () => {
      const employee = await createTestEmployee({ role: 'manager' });
      const phoneE164 = nextTestPhone();
      const insert = async (status: 'hired' | 'in_progress') =>
        (
          await insertTestCandidateApplication({
            telegramUserId: nextTestTelegramUserId(),
            promoCode: nextTestPromoCode(),
            phoneE164,
            phoneSource: 'telegram_contact',
            language: 'ru',
            writeAllowed: true,
            createdAt: new Date(),
            name: nextNameTag(),
            status,
          })
        ).applicationId;
      const hiredId = await insert('hired');
      await insert('in_progress');

      await expect(
        markApplicationStatus({ applicationId: hiredId, status: 'in_progress', employeeId: employee.employeeId }),
      ).rejects.toMatchObject({ code: 'open_application_exists' });

      expect((await readTestCandidateApplication(hiredId))?.status).toBe('hired');
      expect(await readTestApplicationEvents(hiredId)).toEqual([]);
    });

    it('вернуть в работу закрывает незаконченный черновик в чате этой заявкой', async () => {
      const employee = await createTestEmployee({ role: 'manager' });
      const telegramUserId = nextTestTelegramUserId();
      const { applicationId } = await insertTestCandidateApplication({
        telegramUserId,
        promoCode: nextTestPromoCode(),
        phoneE164: nextTestPhone(),
        language: 'ru',
        writeAllowed: true,
        createdAt: new Date(),
        name: nextNameTag(),
        status: 'rejected',
      });
      const { draftId } = await insertTestOpenChatDraft({ telegramUserId, promoCode: nextTestPromoCode() });

      await markApplicationStatus({ applicationId, status: 'in_progress', employeeId: employee.employeeId });

      const drafts = await readTestChatDrafts(telegramUserId);

      expect((await readTestCandidateApplication(applicationId))?.status).toBe('in_progress');
      expect(drafts.map((draft) => ({ id: draft.id, applicationId: draft.applicationId }))).toEqual([
        { id: draftId, applicationId },
      ]);
    });

    it('«Отказ» черновик в чате не трогает', async () => {
      const employee = await createTestEmployee({ role: 'manager' });
      const telegramUserId = nextTestTelegramUserId();
      const { applicationId } = await insertTestCandidateApplication({
        telegramUserId,
        promoCode: nextTestPromoCode(),
        phoneE164: nextTestPhone(),
        language: 'ru',
        writeAllowed: true,
        createdAt: new Date(),
        name: nextNameTag(),
      });
      await insertTestOpenChatDraft({ telegramUserId, promoCode: nextTestPromoCode() });

      await markApplicationStatus({ applicationId, status: 'rejected', employeeId: employee.employeeId });

      expect((await readTestChatDrafts(telegramUserId))[0]?.applicationId).toBeNull();
    });

    it('отметка снимает ожидание ответа', async () => {
      const now = new Date();
      const tag = nextNameTag();
      const employee = await createTestEmployee({ role: 'manager' });
      const applicationId = await createApplication({ name: tag, createdAt: hoursAgo(now, 2) });

      expect((await listApplications({ filter: 'waiting', query: tag, offset: 0, now })).total).toBe(1);

      await markApplicationStatus({ applicationId, status: 'rejected', employeeId: employee.employeeId });
      await markApplicationStatus({ applicationId, status: 'in_progress', employeeId: employee.employeeId });

      expect((await listApplications({ filter: 'waiting', query: tag, offset: 0, now })).total).toBe(0);
    });
  });

  describe('ответ из админки', () => {
    it('доставлен — заявка в работе, ведёт автор, ожидание снято', async () => {
      const tag = nextNameTag();
      const owner = await createTestEmployee({ role: 'owner' });
      const applicationId = await createApplication({
        name: tag,
        createdAt: hoursAgo(new Date(), 1),
        forumChatId: nextTestTelegramUserId(),
        forumTopicId: 777,
      });

      const reply = await replyFromAdmin({
        applicationId,
        employeeId: owner.employeeId,
        employeeName: 'Владелец',
        text: 'Здравствуйте <b>Азиз</b>',
      });

      expect(reply).toEqual({ delivery: 'delivered' });

      const application = await readTestCandidateApplication(applicationId);
      const messages = await readTestCandidateMessages(applicationId);

      expect(application).toMatchObject({ status: 'in_progress', handledByEmployeeId: owner.employeeId });
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        author: 'employee',
        employeeId: owner.employeeId,
        text: 'Здравствуйте <b>Азиз</b>',
        delivery: 'delivered',
      });
      expect((await listApplications({ filter: 'waiting', query: tag, offset: 0 })).total).toBe(0);
    });

    it('бот не может писать кандидату — отказ, строки нет', async () => {
      const owner = await createTestEmployee({ role: 'owner' });
      const applicationId = await createApplication({ name: nextNameTag(), createdAt: new Date(), writeAllowed: false });

      await expect(
        replyFromAdmin({ applicationId, employeeId: owner.employeeId, employeeName: 'Владелец', text: 'Здравствуйте' }),
      ).rejects.toMatchObject({ code: 'cannot_write' });

      expect(await readTestCandidateMessages(applicationId)).toEqual([]);
      expect((await readTestCandidateApplication(applicationId))?.status).toBe('new');
    });
  });

  describe('карточка', () => {
    it('первый ответ — самое раннее из сообщения сотрудника и отметки, бот не в счёт', async () => {
      const now = new Date();
      const employee = await createTestEmployee({ role: 'manager' });
      const applicationId = await createApplication({ name: nextNameTag(), createdAt: hoursAgo(now, 5) });

      await insertTestCandidateMessage({ applicationId, author: 'bot', delivery: 'delivered', createdAt: hoursAgo(now, 5) });
      await insertTestApplicationEvent({ applicationId, kind: 'hired', employeeId: employee.employeeId, createdAt: hoursAgo(now, 3) });
      await insertTestCandidateMessage({
        applicationId,
        author: 'employee',
        employeeId: employee.employeeId,
        delivery: 'delivered',
        createdAt: hoursAgo(now, 2),
      });

      const card = await readApplicationCard({ applicationId, viewerRole: 'manager' });

      expect(card.firstReply).toEqual({ at: hoursAgo(now, 3).toISOString(), employeeName: 'Тестовый Сотрудник' });
      expect(card.application).toMatchObject({ waitingSince: null, waitingFrom: null });
      expect(card.messages.map((message) => message.author)).toEqual(['bot', 'employee']);
      expect(card.canReply).toBe(false);
      expect(card.firstTrip).toBeNull();
    });
  });

  describe('участники программы, пришли по рекламе', () => {
    it('строка на человека по последнему касанию, только реклама в Telegram и участники', async () => {
      const now = new Date();
      const adCode = nextTestPromoCode();
      const posterCode = nextTestPromoCode();

      await createTestPromoLink(adCode, hoursAgo(now, 100), 'telegram_ad', 'miniapp');
      await createTestPromoLink(posterCode, hoursAgo(now, 100), 'poster');

      const member = await createTestPerson({ inProgram: true });
      const posterMember = await createTestPerson({ inProgram: true });
      const notMember = await createTestPerson({ inProgram: true });
      const demo = await createTestPerson({ inProgram: true });

      await markTestPersonDemo(demo.personId);
      await createTestTrip({
        profileId: member.profileId,
        tripOrderId: `test-ad-${member.personId}`,
        status: 'complete',
        endedAt: hoursAgo(now, 10),
      });

      const memberTelegram = nextTestTelegramUserId();

      await insertTestPromoTouch({ code: adCode, telegramUserId: memberTelegram, touchedAt: hoursAgo(now, 0.2), wasParticipant: true, personId: member.personId });
      await insertTestPromoTouch({ code: adCode, telegramUserId: memberTelegram, touchedAt: hoursAgo(now, 0.1), wasParticipant: true, personId: member.personId });
      await insertTestPromoTouch({ code: posterCode, telegramUserId: nextTestTelegramUserId(), touchedAt: now, wasParticipant: true, personId: posterMember.personId });
      await insertTestPromoTouch({ code: adCode, telegramUserId: nextTestTelegramUserId(), touchedAt: now, wasParticipant: false, personId: notMember.personId });
      await insertTestPromoTouch({ code: adCode, telegramUserId: nextTestTelegramUserId(), touchedAt: now, wasParticipant: true, personId: demo.personId });

      const list = await listAdParticipants(0);
      const ours = list.rows.filter((row) =>
        [member.personId, posterMember.personId, notMember.personId, demo.personId].includes(row.personId),
      );

      expect(ours).toEqual([
        {
          personId: member.personId,
          callsign: null,
          name: 'Тестов Тест',
          promoName: `Тест ${adCode}`,
          promoCode: adCode,
          touchedAt: hoursAgo(now, 0.1).toISOString(),
          lastTripAt: hoursAgo(now, 10).toISOString(),
        },
      ]);
      expect(list.total).toBeGreaterThanOrEqual(1);
    });
  });
});

