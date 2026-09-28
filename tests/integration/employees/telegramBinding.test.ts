import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { db } from '#server/db';
import { addDemoViewer } from '#server/services/demo/addDemoViewer';
import { bindEmployeeTelegram } from '#server/services/employees/bindEmployeeTelegram';
import { INVITE_LIFETIME_MS, TELEGRAM_LINK_LIFETIME_MS } from '#server/services/employees/config';
import { issueTelegramLinkToken } from '#server/services/employees/telegramLink';
import { cleanupTestData, createTestPerson, disconnectDatabase } from '../support/database';
import { cleanupTestDemo, trackTestDemoViewer } from '../support/demo';
import {
  cleanupTestEmployees,
  createTestEmployee,
  issueTestAccessLink,
  linkTestDriver,
  nextTestPhone,
  nextTestTelegramUserId,
  readAccessLinkByToken,
  readTestEmployee,
  trackTestEmployee,
} from '../support/employees';
import { disconnectQueues } from '../support/queues';

/**
 * Привязка Telegram сотрудника (issue #267): кто вправе выпустить ссылку, срок и отзыв прежней —
 * и отказ демо-зрителю. У действующего зрителя открыта привязка к демо-водителю, и без своей
 * проверки его Telegram получал бы водительский отказ; отказ — свой, `telegram_demo`, и ссылку
 * он не гасит.
 *
 * Выпуск проверяется без бота (`issueTelegramLinkToken`): ссылку на бота собирает обёртка
 * из имени бота, а за ним она ходит в Telegram, которого тесту не нужно.
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

  it('руководитель выпускает ссылку чужой учётке роли ниже, каждый — себе; своей роли и выше — отказ', async () => {
    const owner = await createTestEmployee({ role: 'owner', telegramUserId: null });
    const admin = await createTestEmployee({ role: 'admin', telegramUserId: null });
    const secondAdmin = await createTestEmployee({ role: 'admin', telegramUserId: null });
    const manager = await createTestEmployee({ role: 'manager', telegramUserId: null });
    const asAdmin = { employeeId: admin.employeeId, role: 'admin' as const };
    const outcomeOf = async (actor: typeof asAdmin | { employeeId: string; role: 'owner' | 'manager' }, employeeId: string) =>
      (await issueTelegramLinkToken({ actor, employeeId })).outcome;

    expect(await outcomeOf(asAdmin, manager.employeeId)).toBe('issued');
    expect(await outcomeOf({ employeeId: owner.employeeId, role: 'owner' }, admin.employeeId)).toBe('issued');
    expect(await outcomeOf(asAdmin, secondAdmin.employeeId)).toBe('forbidden');
    expect(await outcomeOf(asAdmin, owner.employeeId)).toBe('forbidden');
    expect(await outcomeOf({ employeeId: manager.employeeId, role: 'manager' }, admin.employeeId)).toBe('forbidden');

    // Себе — каждый, включая менеджера и владельца: у владельца руководителя нет.
    expect(await outcomeOf({ employeeId: manager.employeeId, role: 'manager' }, manager.employeeId)).toBe('issued');
    expect(await outcomeOf({ employeeId: owner.employeeId, role: 'owner' }, owner.employeeId)).toBe('issued');
    expect(await outcomeOf(asAdmin, '00000000-0000-4000-8000-000000000000')).toBe('not_found');
  });

  it('демо-учётке ссылка не выпускается, учётке с Telegram — ответ состоянием', async () => {
    const owner = await createTestEmployee({ role: 'owner' });
    const asOwner = { employeeId: owner.employeeId, role: 'owner' as const };
    // Демо-менеджер один на базу (`employees_demo_role_key`); в тестовой базе его заводят только
    // тесты, и каждый убирает за собой.
    const [demo] = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO xb.employees ("role", "full_name", "phone_e164", "is_demo")
      VALUES ('manager', 'Тестовый Демо-менеджер', ${nextTestPhone()}, true)
      RETURNING "id"
    `;

    trackTestEmployee(demo?.id ?? '');

    const bound = await createTestEmployee({ role: 'manager' });

    expect((await issueTelegramLinkToken({ actor: asOwner, employeeId: demo?.id ?? '' })).outcome).toBe('demo_account');
    expect((await issueTelegramLinkToken({ actor: asOwner, employeeId: bound.employeeId })).outcome).toBe('bound');
  });

  it('ссылка живёт 48 часов, выпускает её действующий, новая отзывает прежнюю', async () => {
    const owner = await createTestEmployee({ role: 'owner' });
    const manager = await createTestEmployee({ role: 'manager', telegramUserId: null });
    const actor = { employeeId: owner.employeeId, role: 'owner' as const };
    const now = new Date();

    const first = await issueTelegramLinkToken({ actor, employeeId: manager.employeeId, now });

    if (first.outcome !== 'issued') {
      throw new Error(`ссылка не выпущена: ${first.outcome}`);
    }

    expect(TELEGRAM_LINK_LIFETIME_MS).toBe(INVITE_LIFETIME_MS);
    expect(first.expiresAt.getTime()).toBe(now.getTime() + 48 * 60 * 60 * 1_000);
    expect(await readAccessLinkByToken(first.token)).toMatchObject({
      employeeId: manager.employeeId,
      kind: 'telegram',
      issuedById: owner.employeeId,
    });

    const second = await issueTelegramLinkToken({ actor, employeeId: manager.employeeId });

    if (second.outcome !== 'issued') {
      throw new Error(`вторая ссылка не выпущена: ${second.outcome}`);
    }

    expect(await readAccessLinkByToken(first.token)).toMatchObject({ token: null });
    expect((await readAccessLinkByToken(first.token))?.revokedAt).not.toBeNull();
    expect(await bindEmployeeTelegram({ token: first.token, telegramUserId: nextTestTelegramUserId() })).toBe('revoked');
    expect(await bindEmployeeTelegram({ token: second.token, telegramUserId: nextTestTelegramUserId() })).toBe('bound');
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
