import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

import { createEvent, type EventHandler, type H3Event } from 'h3';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { db } from '#server/db';
import type { EmployeeRole } from '#server/generated/prisma/enums';
import adParticipantsHandler from '#server/api/applications/ad-participants.get';
import cardHandler from '#server/api/applications/[id]/index.get';
import messagesHandler from '#server/api/applications/[id]/messages.post';
import statusHandler from '#server/api/applications/[id]/status.post';
import listHandler from '#server/api/applications/index.get';
import unfinishedCardHandler from '#server/api/applications/unfinished/[id]/index.get';
import unfinishedDismissHandler from '#server/api/applications/unfinished/[id]/dismiss.post';
import unfinishedMessagesHandler from '#server/api/applications/unfinished/[id]/messages.post';
import unfinishedListHandler from '#server/api/applications/unfinished/index.get';
import waitingCountHandler from '#server/api/applications/waiting-count.get';
import { SESSION_COOKIE_NAME, signEmployeeSession } from '#server/utils/employeeSession';
import {
  cleanupTestCandidateApplications,
  insertTestCandidateApplication,
  insertTestChatDraft,
  readTestCandidateMessages,
  readTestChatDraftMessages,
} from '../support/candidates';
import { disconnectDatabase } from '../support/database';
import {
  cleanupTestEmployees,
  createTestEmployee,
  nextTestPhone,
  nextTestTelegramUserId,
  trackTestEmployee,
} from '../support/employees';
import { nextTestPromoCode } from '../support/promo';
import { disconnectQueues } from '../support/queues';

/**
 * Доступ к разделу «Заявки» (issue #471) и его вкладке «Не закончили» (issue #475) — ручками, как
 * их зовёт веб: cookie сессии, проверка учётки и роли. Ветки, которых в обычной работе не встречается, — демо-сотрудник и менеджер
 * у ответа из админки — ломаются молча, и кандидату ушло бы сообщение от имени парка
 * не от того, кому это разрешено (docs/infra.md → «Тесты», доступ).
 *
 * Ручки зовутся напрямую: функции `h3` они берут явно, без автоимпорта Nitro.
 */

const SESSION_SECRET = process.env.EMPLOYEE_SESSION_SECRET ?? '';

const eventFor = (employeeId: string, role: EmployeeRole, params: Record<string, string> = {}): H3Event => {
  const request = new IncomingMessage(new Socket());
  const cookie = signEmployeeSession(
    { employeeId, role, issuedAtSeconds: Math.floor(Date.now() / 1000) },
    SESSION_SECRET,
  );

  request.method = 'POST';
  request.headers = { cookie: `${SESSION_COOKIE_NAME}=${cookie}` };

  const event = createEvent(request, new ServerResponse(request));
  event.context.params = params;

  return event;
};

/**
 * Демо-сотрудник. Он один на роль — частичным индексом, — поэтому уже заведённый в тестовой
 * базе берётся как есть, а свой заводится и убирается, только если его нет.
 */
const demoEmployee = async (): Promise<{ employeeId: string; role: EmployeeRole }> => {
  const existing = await db.employee.findFirst({ where: { isDemo: true }, select: { id: true, role: true } });

  if (existing) {
    return { employeeId: existing.id, role: existing.role };
  }

  const created = await db.employee.create({
    data: { role: 'manager', fullName: 'Демо Менеджер', phoneE164: nextTestPhone(), isDemo: true, telegramUserId: null },
  });

  trackTestEmployee(created.id);

  return { employeeId: created.id, role: created.role };
};

const createApplication = async (): Promise<string> => {
  const { applicationId } = await insertTestCandidateApplication({
    telegramUserId: nextTestTelegramUserId(),
    promoCode: nextTestPromoCode(),
    phoneE164: nextTestPhone(),
    language: 'ru',
    writeAllowed: true,
    createdAt: new Date(),
  });

  return applicationId;
};

const createDraft = async (): Promise<string> => {
  const { draftId } = await insertTestChatDraft({
    telegramUserId: nextTestTelegramUserId(),
    promoCode: nextTestPromoCode(),
    startedAt: new Date(),
  });

  return draftId;
};

const callHandler = (handler: EventHandler, event: H3Event): Promise<unknown> => Promise.resolve(handler(event));

describe('доступ к разделу «Заявки»', () => {
  afterEach(async () => {
    await cleanupTestCandidateApplications();
    await cleanupTestEmployees();
  });

  afterAll(async () => {
    await disconnectDatabase();
    await disconnectQueues();
  });

  it('ответ из админки менеджеру и старшему менеджеру — 403, строки нет', async () => {
    expect(SESSION_SECRET).not.toBe('');

    const applicationId = await createApplication();

    for (const role of ['manager', 'senior_manager'] as const) {
      const employee = await createTestEmployee({ role });

      await expect(
        callHandler(messagesHandler, eventFor(employee.employeeId, role, { id: applicationId })),
      ).rejects.toMatchObject({ statusCode: 403, data: { code: 'role_not_allowed' } });
    }

    expect(await readTestCandidateMessages(applicationId)).toEqual([]);
  });

  it('ответ человеку из «Не закончили» менеджеру и старшему менеджеру — 403, строки нет', async () => {
    expect(SESSION_SECRET).not.toBe('');

    const draftId = await createDraft();

    for (const role of ['manager', 'senior_manager'] as const) {
      const employee = await createTestEmployee({ role });

      await expect(
        callHandler(unfinishedMessagesHandler, eventFor(employee.employeeId, role, { id: draftId })),
      ).rejects.toMatchObject({ statusCode: 403, data: { code: 'role_not_allowed' } });
    }

    expect(await readTestChatDraftMessages(draftId)).toEqual([]);
  });

  it('менеджеру открыты список, счётчик и карточка', async () => {
    const applicationId = await createApplication();
    const employee = await createTestEmployee({ role: 'manager' });

    await expect(callHandler(waitingCountHandler, eventFor(employee.employeeId, 'manager'))).resolves.toMatchObject({
      count: expect.any(Number),
    });
    await expect(
      callHandler(cardHandler, eventFor(employee.employeeId, 'manager', { id: applicationId })),
    ).resolves.toMatchObject({ canReply: false });
  });

  it('демо-сотруднику любая ручка раздела — отказ', async () => {
    expect(SESSION_SECRET).not.toBe('');

    const applicationId = await createApplication();
    const draftId = await createDraft();
    const demo = await demoEmployee();
    const handlers: [string, EventHandler, string][] = [
      ['список', listHandler, applicationId],
      ['счётчик', waitingCountHandler, applicationId],
      ['участники по рекламе', adParticipantsHandler, applicationId],
      ['карточка', cardHandler, applicationId],
      ['отметка', statusHandler, applicationId],
      ['ответ', messagesHandler, applicationId],
      ['«Не закончили»', unfinishedListHandler, draftId],
      ['карточка «Не закончили»', unfinishedCardHandler, draftId],
      ['ответ «Не закончили»', unfinishedMessagesHandler, draftId],
      ['«Убрать из списка»', unfinishedDismissHandler, draftId],
    ];

    for (const [name, handler, id] of handlers) {
      await expect(
        callHandler(handler, eventFor(demo.employeeId, demo.role, { id })),
        name,
      ).rejects.toMatchObject({ statusCode: 403, data: { code: 'demo_not_allowed' } });
    }
  });
});
