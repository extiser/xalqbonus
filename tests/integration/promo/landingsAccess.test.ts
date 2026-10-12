import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

import { createEvent, type EventHandler, type H3Event } from 'h3';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import archiveHandler from '#server/api/promo/landings/[id]/archive.post';
import deleteHandler from '#server/api/promo/landings/[id]/index.delete';
import cardHandler from '#server/api/promo/landings/[id]/index.get';
import unarchiveHandler from '#server/api/promo/landings/[id]/unarchive.post';
import versionsHandler from '#server/api/promo/landings/[id]/versions.post';
import checkHandler from '#server/api/promo/landings/check.post';
import listHandler from '#server/api/promo/landings/index.get';
import uploadHandler from '#server/api/promo/landings/index.post';
import optionsHandler from '#server/api/promo/landings/options.get';
import type { EmployeeRole } from '#server/generated/prisma/enums';
import { SESSION_COOKIE_NAME, signEmployeeSession } from '#server/utils/employeeSession';
import { disconnectDatabase } from '../support/database';
import { cleanupTestEmployees, createTestEmployee } from '../support/employees';
import { disconnectQueues } from '../support/queues';

/**
 * Доступ к лендингам «Промо» (issue #478) — ручками, как их зовёт веб: cookie сессии, проверка
 * учётки и роли. Раздел — владельцу и админу (`PROMO_ROLES`); менеджер, набравший адрес руками,
 * не должен ни загрузить, ни удалить лендинг рекламы парка (docs/infra.md → «Тесты», доступ).
 */

const SESSION_SECRET = process.env.EMPLOYEE_SESSION_SECRET ?? '';

/** Лендинга с таким id нет — до него отказ по роли и не дойдёт. */
const LANDING_ID = '00000000-0000-4000-8000-000000000000';

const eventFor = (employeeId: string, role: EmployeeRole): H3Event => {
  const request = new IncomingMessage(new Socket());
  const cookie = signEmployeeSession(
    { employeeId, role, issuedAtSeconds: Math.floor(Date.now() / 1000) },
    SESSION_SECRET,
  );

  request.method = 'POST';
  request.headers = { cookie: `${SESSION_COOKIE_NAME}=${cookie}` };

  const event = createEvent(request, new ServerResponse(request));
  event.context.params = { id: LANDING_ID };

  return event;
};

const callHandler = (handler: EventHandler, event: H3Event): Promise<unknown> => Promise.resolve(handler(event));

describe('доступ к лендингам «Промо»', () => {
  afterEach(async () => {
    await cleanupTestEmployees();
  });

  afterAll(async () => {
    await disconnectDatabase();
    await disconnectQueues();
  });

  it('менеджеру и старшему менеджеру любая ручка лендингов — 403', async () => {
    expect(SESSION_SECRET).not.toBe('');

    const handlers: [string, EventHandler][] = [
      ['проверка', checkHandler],
      ['загрузка', uploadHandler],
      ['список', listHandler],
      ['выбор у метки', optionsHandler],
      ['предпросмотр', cardHandler],
      ['замена', versionsHandler],
      ['в архив', archiveHandler],
      ['из архива', unarchiveHandler],
      ['удаление', deleteHandler],
    ];

    for (const role of ['manager', 'senior_manager'] as const) {
      const employee = await createTestEmployee({ role });

      for (const [name, handler] of handlers) {
        await expect(callHandler(handler, eventFor(employee.employeeId, role)), `${role}: ${name}`).rejects.toMatchObject({
          statusCode: 403,
          data: { code: 'role_not_allowed' },
        });
      }
    }
  });
});
