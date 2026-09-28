import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { addDemoViewer } from '#server/services/demo/addDemoViewer';
import { bindEmployeeTelegram } from '#server/services/employees/bindEmployeeTelegram';
import { TELEGRAM_LINK_LIFETIME_MS } from '#server/services/employees/config';
import { cleanupTestData, createTestPerson, disconnectDatabase } from '../support/database';
import { cleanupTestDemo, trackTestDemoViewer } from '../support/demo';
import {
  cleanupTestEmployees,
  createTestEmployee,
  issueTestAccessLink,
  linkTestDriver,
  nextTestTelegramUserId,
  readAccessLinkByToken,
  readTestEmployee,
} from '../support/employees';
import { disconnectQueues } from '../support/queues';

/**
 * Привязка Telegram сотрудника и демо-зритель (issue #267): у действующего зрителя открыта
 * привязка к демо-водителю, и без своей проверки его Telegram получал бы водительский отказ.
 * Отказ — свой, `telegram_demo`, и ссылку он не гасит.
 */

describe('привязка Telegram сотрудника', () => {
  afterEach(async () => {
    await cleanupTestDemo();
    await cleanupTestEmployees();
    await cleanupTestData();
  });
  afterAll(async () => {
    await disconnectDatabase();
    await disconnectQueues();
  });

  it('Telegram действующего демо-зрителя не привязывается, и ссылка остаётся живой', async () => {
    // Демо-водитель копирует условия у живого участника — без источника зрителя не завести.
    const source = await createTestPerson({ inProgram: true });

    await linkTestDriver(source.personId, nextTestTelegramUserId());

    const viewerTelegramUserId = nextTestTelegramUserId();
    const viewer = await addDemoViewer({ telegramUserId: viewerTelegramUserId, label: 'проверка 267' });

    if (!('personId' in viewer)) {
      throw new Error(`зритель не завёлся: ${viewer.outcome}`);
    }

    trackTestDemoViewer(viewerTelegramUserId, viewer.personId);

    const employee = await createTestEmployee({ role: 'manager', telegramUserId: null });
    const token = await issueTestAccessLink(employee.employeeId, 'telegram', TELEGRAM_LINK_LIFETIME_MS);

    expect(await bindEmployeeTelegram({ token, telegramUserId: viewerTelegramUserId })).toBe('telegram_demo');
    expect((await readTestEmployee(employee.employeeId))?.telegramUserId).toBeNull();
    expect(await readAccessLinkByToken(token)).toMatchObject({ usedAt: null, revokedAt: null, token });
  });
});
