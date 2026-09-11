import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { insertEmployeeInvite } from '#server/repositories/employeeInvites';
import { acceptInvite } from '#server/services/employees/acceptInvite';
import { INVITE_LIFETIME_MS } from '#server/services/employees/config';
import { createInviteToken, hashInviteToken } from '#server/services/employees/inviteToken';
import { issueInvite, RoleNotInvitableError } from '#server/services/employees/issueInvite';
import { canInviteRole } from '#server/services/employees/roles';
import { revokeInvite } from '#server/services/employees/revokeInvite';
import { cleanupTestData, createTestPerson, disconnectDatabase } from '../support/database';
import {
  cleanupTestEmployees,
  createTestEmployee,
  linkTestDriver,
  nextTestPhone,
  nextTestTelegramUserId,
  readInviteById,
  readTestEmployee,
  setTestProfilePhone,
  trackTestEmployee,
} from '../support/employees';

/**
 * Приглашения сотрудников: срок, одноразовость, правило «роль строго ниже своей»
 * и отказ при пересечении ролей.
 *
 * Приглашения кладутся в базу репозиторием, а не `issueInvite`: тот перед записью ходит
 * в Telegram за именем бота, чтобы собрать ссылку, а тесту сеть не нужна и не должна быть
 * нужна. Проверяется здесь то, что решает `acceptInvite`, — и решает он по строке в базе.
 *
 * Правило ролей при этом проверяется и на самом `issueInvite`: отказ по роли случается
 * до всякого обращения к Telegram, и ровно это в нём и важно.
 */

const HOUR_MS = 60 * 60 * 1_000;

const insertInviteFor = async (
  invitedById: string,
  role: 'admin' | 'manager',
  expiresAt: Date,
): Promise<{ token: string; inviteId: string }> => {
  const token = createInviteToken();
  const invite = await insertEmployeeInvite({
    role,
    tokenHash: hashInviteToken(token),
    invitedById,
    expiresAt,
  });

  return { token, inviteId: invite.id };
};

describe('приглашения сотрудников', () => {
  afterEach(async () => {
    await cleanupTestEmployees();
    await cleanupTestData();
  });
  afterAll(disconnectDatabase);

  it('приглашать можно только роль строго ниже своей', async () => {
    expect(canInviteRole('owner', 'admin')).toBe(true);
    expect(canInviteRole('owner', 'manager')).toBe(true);
    expect(canInviteRole('admin', 'manager')).toBe(true);

    // Равная роль — тоже отказ: админ, заводящий админа, расширяет круг равных себе.
    expect(canInviteRole('admin', 'admin')).toBe(false);
    expect(canInviteRole('admin', 'owner')).toBe(false);
    expect(canInviteRole('manager', 'manager')).toBe(false);
    expect(canInviteRole('owner', 'owner')).toBe(false);
  });

  it('выпуск приглашения на роль не ниже своей отбивается до обращения к Telegram', async () => {
    const admin = await createTestEmployee({ role: 'admin' });

    await expect(
      issueInvite({ actor: { employeeId: admin.employeeId, role: 'admin' }, role: 'admin' }),
    ).rejects.toBeInstanceOf(RoleNotInvitableError);

    await expect(
      issueInvite({ actor: { employeeId: admin.employeeId, role: 'admin' }, role: 'owner' }),
    ).rejects.toBeInstanceOf(RoleNotInvitableError);
  });

  it('приглашение принимается один раз: вторая попытка учётки не создаёт', async () => {
    const owner = await createTestEmployee({ role: 'owner' });
    const { token } = await insertInviteFor(
      owner.employeeId,
      'admin',
      new Date(Date.now() + INVITE_LIFETIME_MS),
    );
    const telegramUserId = nextTestTelegramUserId();
    const phone = nextTestPhone();

    const first = await acceptInvite({
      token,
      telegramUserId,
      contactUserId: telegramUserId,
      phoneRaw: phone,
      fullName: 'Азиз Каримов',
    });

    expect(first.outcome).toBe('accepted');

    if (first.outcome !== 'accepted') {
      return;
    }

    trackTestEmployee(first.employeeId);

    const created = await readTestEmployee(first.employeeId);

    // В учётке проставлены оба признака входа сразу — это и есть смысл одного действия
    // человека: телефон из контакта, идентификатор из подписи апдейта.
    expect(created?.role).toBe('admin');
    expect(created?.phoneE164).toBe(phone);
    expect(created?.telegramUserId).toBe(telegramUserId);
    // Пароля нет: его сотрудник задаёт себе сам, из Mini App.
    expect(created?.passwordHash).toBeNull();

    const second = await acceptInvite({
      token,
      telegramUserId: nextTestTelegramUserId(),
      contactUserId: null,
      phoneRaw: nextTestPhone(),
      fullName: 'Кто-то ещё',
    });

    expect(second.outcome).toBe('already_accepted');
  });

  it('просроченное приглашение отклоняется и учётки не создаёт', async () => {
    const owner = await createTestEmployee({ role: 'owner' });
    // Срок — 48 часов; час назад истёк.
    const { token, inviteId } = await insertInviteFor(
      owner.employeeId,
      'manager',
      new Date(Date.now() - HOUR_MS),
    );
    const telegramUserId = nextTestTelegramUserId();

    const result = await acceptInvite({
      token,
      telegramUserId,
      contactUserId: telegramUserId,
      phoneRaw: nextTestPhone(),
      fullName: 'Опоздавший',
    });

    expect(result.outcome).toBe('expired');

    const invite = await readInviteById(inviteId);

    expect(invite?.acceptedAt).toBeNull();
    expect(invite?.employeeId).toBeNull();
  });

  it('отозванное приглашение не принимается, а повторный отзыв отвечает «нечего отзывать»', async () => {
    const owner = await createTestEmployee({ role: 'owner' });
    const { token, inviteId } = await insertInviteFor(
      owner.employeeId,
      'manager',
      new Date(Date.now() + INVITE_LIFETIME_MS),
    );
    const actor = { employeeId: owner.employeeId, role: 'owner' as const };

    expect(await revokeInvite({ actor, inviteId })).toBe('revoked');
    expect(await revokeInvite({ actor, inviteId })).toBe('not_pending');

    const telegramUserId = nextTestTelegramUserId();
    const result = await acceptInvite({
      token,
      telegramUserId,
      contactUserId: telegramUserId,
      phoneRaw: nextTestPhone(),
      fullName: 'Отозванный',
    });

    expect(result.outcome).toBe('revoked');
  });

  it('отозвать приглашение роли не ниже своей нельзя', async () => {
    const owner = await createTestEmployee({ role: 'owner' });
    const manager = await createTestEmployee({ role: 'manager' });
    const { inviteId } = await insertInviteFor(
      owner.employeeId,
      'admin',
      new Date(Date.now() + INVITE_LIFETIME_MS),
    );

    expect(
      await revokeInvite({
        actor: { employeeId: manager.employeeId, role: 'manager' },
        inviteId,
      }),
    ).toBe('forbidden');
  });

  it('чужой контакт приглашение не принимает', async () => {
    const owner = await createTestEmployee({ role: 'owner' });
    const { token, inviteId } = await insertInviteFor(
      owner.employeeId,
      'manager',
      new Date(Date.now() + INVITE_LIFETIME_MS),
    );

    const result = await acceptInvite({
      token,
      telegramUserId: nextTestTelegramUserId(),
      // Контакт из адресной книги: прислан одним человеком, принадлежит другому.
      contactUserId: nextTestTelegramUserId(),
      phoneRaw: nextTestPhone(),
      fullName: 'Скрепка',
    });

    expect(result.outcome).toBe('contact_not_own');
    expect((await readInviteById(inviteId))?.acceptedAt).toBeNull();
  });

  it('Telegram за активной водительской привязкой приглашение не принимает', async () => {
    const owner = await createTestEmployee({ role: 'owner' });
    const { token } = await insertInviteFor(
      owner.employeeId,
      'manager',
      new Date(Date.now() + INVITE_LIFETIME_MS),
    );
    const driver = await createTestPerson({ inProgram: true });
    const telegramUserId = nextTestTelegramUserId();

    await linkTestDriver(driver.personId, telegramUserId, telegramUserId);

    const result = await acceptInvite({
      token,
      telegramUserId,
      contactUserId: telegramUserId,
      phoneRaw: nextTestPhone(),
      fullName: 'Водитель',
    });

    expect(result.outcome).toBe('driver_link_exists');
  });

  it('телефон за активной водительской привязкой приглашение не принимает', async () => {
    const owner = await createTestEmployee({ role: 'owner' });
    const { token } = await insertInviteFor(
      owner.employeeId,
      'manager',
      new Date(Date.now() + INVITE_LIFETIME_MS),
    );
    const driver = await createTestPerson({ inProgram: true });
    const phone = nextTestPhone();
    const driverChatId = nextTestTelegramUserId();

    // Телефон живёт на профиле парка, а привязка — на человеке: пересечение доходит
    // до приглашения именно этим путём.
    await setTestProfilePhone(driver.profileId, phone);
    await linkTestDriver(driver.personId, driverChatId, driverChatId);

    const telegramUserId = nextTestTelegramUserId();
    const result = await acceptInvite({
      token,
      telegramUserId,
      contactUserId: telegramUserId,
      phoneRaw: phone,
      fullName: 'Тот же номер',
    });

    expect(result.outcome).toBe('driver_link_exists');
  });

  it('телефон, уже занятый сотрудником, приглашение не принимает', async () => {
    const owner = await createTestEmployee({ role: 'owner' });
    const existing = await createTestEmployee({ role: 'manager' });
    const { token } = await insertInviteFor(
      owner.employeeId,
      'manager',
      new Date(Date.now() + INVITE_LIFETIME_MS),
    );
    const telegramUserId = nextTestTelegramUserId();

    const result = await acceptInvite({
      token,
      telegramUserId,
      contactUserId: telegramUserId,
      phoneRaw: existing.phoneE164 as string,
      fullName: 'Второй раз',
    });

    expect(result.outcome).toBe('employee_exists');
  });

  it('несуществующий токен не принимается', async () => {
    const telegramUserId = nextTestTelegramUserId();

    const result = await acceptInvite({
      token: createInviteToken(),
      telegramUserId,
      contactUserId: telegramUserId,
      phoneRaw: nextTestPhone(),
      fullName: 'Ниоткуда',
    });

    expect(result.outcome).toBe('not_found');
  });
});
