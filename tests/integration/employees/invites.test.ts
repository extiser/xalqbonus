import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { acceptInvite } from '#server/services/employees/acceptInvite';
import { InviteInputError, issueInvite, RoleNotInvitableError } from '#server/services/employees/issueInvite';
import { loginByPassword } from '#server/services/employees/loginByPassword';
import { readInviteByToken } from '#server/services/employees/readInviteByToken';
import { canInviteRole } from '#server/services/employees/roles';
import { revokeInvite } from '#server/services/employees/revokeInvite';
import { cleanupTestData, createTestPerson, disconnectDatabase } from '../support/database';
import {
  cleanupTestEmployees,
  createTestEmployee,
  insertTestInvite,
  linkTestDriver,
  nextTestPhone,
  nextTestTelegramUserId,
  readInviteById,
  readTestEmployee,
  setTestProfilePhone,
  trackTestEmployee,
} from '../support/employees';
import { disconnectQueues } from '../support/queues';

/**
 * Приглашения сотрудников в вебе (issue #267): выпуск с именем и телефоном, принятие с паролем,
 * срок, одноразовость, правило «роль строго ниже своей» и отказ при пересечении ролей.
 *
 * Принятие проверяется и на строках, положенных в базу фикстурой: срок в прошлом и телефон,
 * который выпуск отклонил бы, — это то, что решает принятие по строке, а не выпуск.
 */

const HOUR_MS = 60 * 60 * 1_000;
const PASSWORD = 'довольно-длинный-пароль';
const APP_ORIGIN = 'https://bonus.example';
const CLIENT_ADDRESS = '203.0.113.9';

/** Иностранный номер фикстуры: `+7` и десять цифр, начало случайное, как у узбекских. */
let lastForeignSuffix = 9_000_000_000 + Math.floor(Math.random() * 900_000_000);

const nextForeignPhone = (): string => {
  lastForeignSuffix += 1;

  return `+7${lastForeignSuffix}`;
};

const issueRejection = async (promise: Promise<unknown>): Promise<string | null> => {
  try {
    await promise;

    return null;
  } catch (error) {
    if (error instanceof InviteInputError) {
      return error.problem;
    }

    throw error;
  }
};

describe('приглашения сотрудников', () => {
  afterEach(async () => {
    await cleanupTestEmployees();
    await cleanupTestData();
  });
  afterAll(async () => {
    await disconnectDatabase();
    await disconnectQueues();
  });

  it('приглашать можно только роль строго ниже своей', async () => {
    expect(canInviteRole('owner', 'admin')).toBe(true);
    expect(canInviteRole('owner', 'manager')).toBe(true);
    expect(canInviteRole('admin', 'manager')).toBe(true);

    // Равная роль — тоже отказ: админ, заводящий админа, расширяет круг равных себе.
    expect(canInviteRole('admin', 'admin')).toBe(false);
    expect(canInviteRole('admin', 'owner')).toBe(false);
    expect(canInviteRole('manager', 'manager')).toBe(false);
    expect(canInviteRole('owner', 'senior_manager')).toBe(true);
    expect(canInviteRole('admin', 'senior_manager')).toBe(true);
    // Старший менеджер старше менеджера рангом, но не приглашает никого: экран сотрудников
    // ему закрыт, и ручка приглашения, открытая любой роли, его тоже не пускает (issue #291).
    expect(canInviteRole('senior_manager', 'manager')).toBe(false);
    expect(canInviteRole('senior_manager', 'senior_manager')).toBe(false);
    expect(canInviteRole('owner', 'owner')).toBe(false);

    const admin = await createTestEmployee({ role: 'admin' });

    await expect(
      issueInvite({
        actor: { employeeId: admin.employeeId, role: 'admin' },
        role: 'admin',
        fullName: 'Второй Админ',
        phoneRaw: nextForeignPhone(),
        appOrigin: APP_ORIGIN,
      }),
    ).rejects.toBeInstanceOf(RoleNotInvitableError);
  });

  it('выпуск с иностранным номером даёт ссылку на страницу веба, и по ней видно имя, роль и телефон', async () => {
    const owner = await createTestEmployee({ role: 'owner' });
    const phone = nextForeignPhone();

    const invite = await issueInvite({
      actor: { employeeId: owner.employeeId, role: 'owner' },
      role: 'admin',
      fullName: '  Азиз Каримов  ',
      phoneRaw: phone,
      appOrigin: APP_ORIGIN,
    });

    expect(invite.link.startsWith(`${APP_ORIGIN}/invite/`)).toBe(true);
    expect(invite.fullName).toBe('Азиз Каримов');
    expect(invite.phoneE164).toBe(phone);

    // Токен лежит рядом с хешем, пока приглашение живо, — ссылку можно скопировать снова.
    const token = invite.link.slice(`${APP_ORIGIN}/invite/`.length);

    expect((await readInviteById(invite.inviteId))?.token).toBe(token);
    expect(await readInviteByToken(token)).toMatchObject({
      outcome: 'live',
      invite: { role: 'admin', fullName: 'Азиз Каримов', phoneE164: phone },
    });
  });

  it('выпуск отклоняет пустое и длинное имя, неразборчивый и занятый телефон', async () => {
    const owner = await createTestEmployee({ role: 'owner' });
    const existing = await createTestEmployee({ role: 'manager' });
    const actor = { employeeId: owner.employeeId, role: 'owner' as const };
    const issue = (fullName: string, phoneRaw: string) =>
      issueInvite({ actor, role: 'manager', fullName, phoneRaw, appOrigin: APP_ORIGIN });

    expect(await issueRejection(issue('   ', nextForeignPhone()))).toBe('full_name_missing');
    expect(await issueRejection(issue('я'.repeat(81), nextForeignPhone()))).toBe('full_name_too_long');
    expect(await issueRejection(issue('Кто-то', '12-34'))).toBe('phone_invalid');
    expect(await issueRejection(issue('Кто-то', existing.phoneE164))).toBe('phone_taken');

    // Телефон живого приглашения — тоже занятый логин.
    const phone = nextForeignPhone();

    await issue('Первый', phone);

    expect(await issueRejection(issue('Второй', phone))).toBe('phone_taken');
  });

  it('приглашение на телефон активного водителя не выпускается', async () => {
    const owner = await createTestEmployee({ role: 'owner' });
    const driver = await createTestPerson({ inProgram: true });
    const phone = nextTestPhone();
    const chatId = nextTestTelegramUserId();

    await setTestProfilePhone(driver.profileId, phone);
    await linkTestDriver(driver.personId, chatId, chatId);

    const rejection = await issueRejection(
      issueInvite({
        actor: { employeeId: owner.employeeId, role: 'owner' },
        role: 'manager',
        fullName: 'Водитель',
        phoneRaw: phone,
        appOrigin: APP_ORIGIN,
      }),
    );

    expect(rejection).toBe('driver_link_exists');
  });

  it('принятие заводит учётку с паролем и без Telegram, входит по иностранному номеру, второй раз не принимается', async () => {
    const owner = await createTestEmployee({ role: 'owner' });
    const phone = nextForeignPhone();
    const { token, inviteId } = await insertTestInvite({
      invitedById: owner.employeeId,
      role: 'admin',
      fullName: 'Азиз Каримов',
      phoneE164: phone,
    });

    const first = await acceptInvite({ token, password: PASSWORD });

    expect(first.outcome).toBe('signed_in');

    if (first.outcome !== 'signed_in') {
      return;
    }

    trackTestEmployee(first.employee.employeeId);

    const created = await readTestEmployee(first.employee.employeeId);

    expect(created).toMatchObject({ role: 'admin', fullName: 'Азиз Каримов', phoneE164: phone, telegramUserId: null });
    expect(created?.passwordHash).not.toBeNull();

    // Принятое приглашение называет учётку, и токен стёрт: дамп базы готовой ссылки не даёт.
    expect(await readInviteById(inviteId)).toMatchObject({ employeeId: first.employee.employeeId, token: null });

    expect((await acceptInvite({ token, password: PASSWORD })).outcome).toBe('accepted');
    expect((await readInviteByToken(token)).outcome).toBe('accepted');

    const login = await loginByPassword({ phoneRaw: phone, password: PASSWORD, clientAddress: CLIENT_ADDRESS });

    expect(login.outcome).toBe('signed_in');
  });

  it('короткий пароль приглашение не тратит', async () => {
    const owner = await createTestEmployee({ role: 'owner' });
    const { token, inviteId } = await insertTestInvite({ invitedById: owner.employeeId });

    expect((await acceptInvite({ token, password: 'коротко' })).outcome).toBe('password_too_short');
    expect((await readInviteById(inviteId))?.acceptedAt).toBeNull();
  });

  it('просроченное, отозванное и выдуманное приглашение не принимаются', async () => {
    const owner = await createTestEmployee({ role: 'owner' });
    const expired = await insertTestInvite({
      invitedById: owner.employeeId,
      expiresAt: new Date(Date.now() - HOUR_MS),
    });
    const revoked = await insertTestInvite({ invitedById: owner.employeeId });
    const actor = { employeeId: owner.employeeId, role: 'owner' as const };

    expect(await revokeInvite({ actor, inviteId: revoked.inviteId })).toBe('revoked');
    expect(await revokeInvite({ actor, inviteId: revoked.inviteId })).toBe('not_pending');
    // Отзыв стирает токен так же, как принятие.
    expect((await readInviteById(revoked.inviteId))?.token).toBeNull();

    expect((await acceptInvite({ token: expired.token, password: PASSWORD })).outcome).toBe('expired');
    expect((await acceptInvite({ token: revoked.token, password: PASSWORD })).outcome).toBe('revoked');
    expect((await acceptInvite({ token: 'нет-такого', password: PASSWORD })).outcome).toBe('not_found');
    expect((await readInviteById(expired.inviteId))?.employeeId).toBeNull();
  });

  it('отозвать приглашение роли не ниже своей нельзя', async () => {
    const owner = await createTestEmployee({ role: 'owner' });
    const manager = await createTestEmployee({ role: 'manager' });
    const { inviteId } = await insertTestInvite({ invitedById: owner.employeeId, role: 'admin' });

    expect(
      await revokeInvite({ actor: { employeeId: manager.employeeId, role: 'manager' }, inviteId }),
    ).toBe('forbidden');
  });

  it('телефон, занятый между выпуском и принятием, приглашение не принимает', async () => {
    const owner = await createTestEmployee({ role: 'owner' });
    const { token, phoneE164 } = await insertTestInvite({ invitedById: owner.employeeId });

    await createTestEmployee({ role: 'manager', phoneE164 });

    expect((await acceptInvite({ token, password: PASSWORD })).outcome).toBe('phone_taken');
  });

  it('телефон, ставший водительским между выпуском и принятием, приглашение не принимает', async () => {
    const owner = await createTestEmployee({ role: 'owner' });
    const { token, inviteId, phoneE164 } = await insertTestInvite({ invitedById: owner.employeeId });
    const driver = await createTestPerson({ inProgram: true });
    const chatId = nextTestTelegramUserId();

    // Телефон живёт на профиле парка, а привязка — на человеке: пересечение доходит
    // до приглашения именно этим путём.
    await setTestProfilePhone(driver.profileId, phoneE164);
    await linkTestDriver(driver.personId, chatId, chatId);

    expect((await acceptInvite({ token, password: PASSWORD })).outcome).toBe('driver_link_exists');
    expect((await readInviteById(inviteId))?.acceptedAt).toBeNull();
  });
});
