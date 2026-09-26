import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { db } from '#server/db';
import {
  insertEmployeeInvite,
  markEmployeeInviteAccepted,
  markEmployeeInviteRevoked,
} from '#server/repositories/employeeInvites';
import { replaceOfficeEmployees } from '#server/repositories/offices';
import { authenticateEmployee } from '#server/services/employees/authenticate';
import { INVITE_LIFETIME_MS } from '#server/services/employees/config';
import { createOwner } from '#server/services/employees/createOwner';
import { createInviteToken, hashInviteToken } from '#server/services/employees/inviteToken';
import { hashPassword } from '#server/services/employees/password';
import { readEmployeeAccounts } from '#server/services/employees/readEmployeeAccounts';
import { readPendingInvites } from '#server/services/employees/readPendingInvites';
import { resetEmployeePassword } from '#server/services/employees/resetEmployeePassword';
import { setEmployeeDisabled } from '#server/services/employees/setEmployeeDisabled';
import { signEmployeeSession } from '#server/utils/employeeSession';
import {
  cleanupTestData,
  createTestOffice,
  createTestPerson,
  disconnectDatabase,
} from '../support/database';
import {
  cleanupTestEmployees,
  createTestEmployee,
  linkTestDriver,
  nextTestPhone,
  nextTestTelegramUserId,
  readInviteById,
  readTestEmployee,
  setTestProfilePhone,
} from '../support/employees';

/**
 * Экран сотрудников со стороны сервисов: список учёток и висящих приглашений, выключение
 * и включение, сброс пароля и отказ `createOwner` на телефоне водителя (issue #132).
 *
 * Каждый новый сырой запрос прогоняется здесь в настоящую базу — через сервис, которым его
 * читает ручка (docs/infra.md → «Тесты», сырой SQL).
 */

const HOUR_MS = 60 * 60 * 1_000;
const MINUTE_MS = 60 * 1_000;
const PASSWORD = 'довольно-длинный-пароль';
const SESSION_SECRET = process.env.EMPLOYEE_SESSION_SECRET ?? '';

const sessionCookieFor = (employeeId: string, issuedAt: Date): string =>
  signEmployeeSession(
    { employeeId, role: 'manager', issuedAtSeconds: Math.floor(issuedAt.getTime() / 1000) },
    SESSION_SECRET,
  );

const insertInvite = async (
  invitedById: string,
  role: 'admin' | 'manager',
  expiresAt: Date,
): Promise<string> => {
  const invite = await insertEmployeeInvite({
    role,
    tokenHash: hashInviteToken(createInviteToken()),
    invitedById,
    expiresAt,
  });

  return invite.id;
};

describe('управление сотрудниками', () => {
  const officeIds: string[] = [];

  beforeEach(() => {
    expect(SESSION_SECRET).not.toBe('');
  });

  afterEach(async () => {
    // Закрепления ссылаются и на офис, и на учётку — уходят раньше обоих.
    for (const officeId of officeIds.splice(0)) {
      await db.$executeRaw`DELETE FROM xb.employee_offices WHERE "office_id" = ${officeId}::uuid`;
    }

    await cleanupTestEmployees();
    await cleanupTestData();
  });

  afterAll(disconnectDatabase);

  it('список учёток несёт телефон, офисы, признаки пароля и права смотрящего', async () => {
    const owner = await createTestEmployee({ role: 'owner', telegramUserId: null, passwordHash: 'x' });
    const admin = await createTestEmployee({ role: 'admin', passwordHash: await hashPassword(PASSWORD) });
    const manager = await createTestEmployee({ role: 'manager', disabledAt: new Date() });

    const activeOffice = await createTestOffice();
    const archivedOffice = await createTestOffice({ archived: true });
    officeIds.push(activeOffice, archivedOffice);

    await replaceOfficeEmployees(archivedOffice, [manager.employeeId], db);
    await replaceOfficeEmployees(activeOffice, [manager.employeeId], db);

    const asAdmin = await readEmployeeAccounts({
      actor: { employeeId: admin.employeeId, role: 'admin' },
    });
    const byId = new Map(asAdmin.employees.map((account) => [account.employeeId, account]));

    expect(asAdmin.invitableRoles).toEqual(['manager']);

    expect(byId.get(manager.employeeId)).toEqual({
      employeeId: manager.employeeId,
      fullName: 'Тестовый Сотрудник',
      role: 'manager',
      phoneE164: manager.phoneE164,
      disabled: true,
      passwordSet: false,
      // Работающий офис первым, архивный последним — порядок решает запрос.
      offices: [
        { officeId: activeOffice, name: 'Тестовый офис', archived: false },
        { officeId: archivedOffice, name: 'Тестовый офис', archived: true },
      ],
      anyOffice: false,
      isDemo: false,
      manageable: true,
    });

    // Равный ранг и старший — без права: себя и владельца админ не трогает.
    expect(byId.get(admin.employeeId)).toMatchObject({
      passwordSet: true,
      offices: [],
      anyOffice: true,
      manageable: false,
    });
    expect(byId.get(owner.employeeId)).toMatchObject({ anyOffice: true, manageable: false });

    const asOwner = await readEmployeeAccounts({
      actor: { employeeId: owner.employeeId, role: 'owner' },
    });

    expect(asOwner.invitableRoles).toEqual(['admin', 'manager']);
    expect(
      asOwner.employees.find((account) => account.employeeId === admin.employeeId)?.manageable,
    ).toBe(true);
  });

  it('висящие приглашения: принятые, отозванные и просроченные не показываются', async () => {
    const owner = await createTestEmployee({ role: 'owner' });
    const admin = await createTestEmployee({ role: 'admin' });
    const accepter = await createTestEmployee({ role: 'manager' });
    const live = Date.now() + INVITE_LIFETIME_MS;

    const pendingManager = await insertInvite(owner.employeeId, 'manager', new Date(live));
    const pendingAdmin = await insertInvite(owner.employeeId, 'admin', new Date(live));
    const accepted = await insertInvite(owner.employeeId, 'manager', new Date(live));
    const revoked = await insertInvite(owner.employeeId, 'manager', new Date(live));
    const expired = await insertInvite(owner.employeeId, 'manager', new Date(Date.now() - HOUR_MS));

    await markEmployeeInviteAccepted(accepted, accepter.employeeId, new Date());
    await markEmployeeInviteRevoked(revoked, new Date());

    const result = await readPendingInvites({
      actor: { employeeId: admin.employeeId, role: 'admin' },
    });
    const ours = result.invites.filter((invite) =>
      [pendingManager, pendingAdmin, accepted, revoked, expired].includes(invite.inviteId),
    );

    expect(ours.map((invite) => invite.inviteId).sort()).toEqual(
      [pendingManager, pendingAdmin].sort(),
    );

    const manager = ours.find((invite) => invite.inviteId === pendingManager);
    const adminInvite = ours.find((invite) => invite.inviteId === pendingAdmin);

    expect(manager).toMatchObject({ role: 'manager', invitedByName: 'Тестовый Сотрудник', revocable: true });
    expect(new Date(manager?.expiresAt ?? '').getTime()).toBe(live);
    // Приглашение на админа админ видит, но отозвать не вправе.
    expect(adminInvite?.revocable).toBe(false);
    expect((await readInviteById(pendingAdmin))?.revokedAt).toBeNull();
  });

  it('выключенная учётка не проходит проверку доступа, включённая проходит тем же cookie', async () => {
    const owner = await createTestEmployee({ role: 'owner' });
    const manager = await createTestEmployee({ role: 'manager' });
    const cookieValue = sessionCookieFor(manager.employeeId, new Date(Date.now() - MINUTE_MS));
    const actor = { employeeId: owner.employeeId, role: 'owner' as const };

    expect(
      await setEmployeeDisabled({ actor, employeeId: manager.employeeId, disabled: true }),
    ).toBe('updated');

    const firstDisabledAt = (await readTestEmployee(manager.employeeId))?.disabledAt;

    expect(firstDisabledAt).not.toBeNull();
    expect((await authenticateEmployee({ cookieValue, initData: null })).outcome).toBe('disabled');

    // Повтор время выключения не двигает, и сессии выключение не гасит.
    await setEmployeeDisabled({ actor, employeeId: manager.employeeId, disabled: true });

    const repeated = await readTestEmployee(manager.employeeId);

    expect(repeated?.disabledAt).toEqual(firstDisabledAt);
    expect(repeated?.sessionsValidFrom).toBeNull();

    expect(
      await setEmployeeDisabled({ actor, employeeId: manager.employeeId, disabled: false }),
    ).toBe('updated');
    expect((await authenticateEmployee({ cookieValue, initData: null })).outcome).toBe(
      'authenticated',
    );
  });

  it('выключать можно только роль строго ниже своей', async () => {
    const owner = await createTestEmployee({ role: 'owner' });
    const admin = await createTestEmployee({ role: 'admin' });
    const secondAdmin = await createTestEmployee({ role: 'admin' });
    const asAdmin = { employeeId: admin.employeeId, role: 'admin' as const };
    const asOwner = { employeeId: owner.employeeId, role: 'owner' as const };

    expect(await setEmployeeDisabled({ actor: asAdmin, employeeId: secondAdmin.employeeId, disabled: true })).toBe('forbidden');
    expect(await setEmployeeDisabled({ actor: asAdmin, employeeId: admin.employeeId, disabled: true })).toBe('forbidden');
    expect(await setEmployeeDisabled({ actor: asAdmin, employeeId: owner.employeeId, disabled: true })).toBe('forbidden');
    expect(await setEmployeeDisabled({ actor: asOwner, employeeId: owner.employeeId, disabled: true })).toBe('forbidden');
    expect(
      await setEmployeeDisabled({
        actor: asOwner,
        employeeId: '00000000-0000-4000-8000-000000000000',
        disabled: true,
      }),
    ).toBe('not_found');

    expect((await readTestEmployee(secondAdmin.employeeId))?.disabledAt).toBeNull();
    expect((await readTestEmployee(owner.employeeId))?.disabledAt).toBeNull();
  });

  it('сброс пароля гасит cookie, обнуляет пароль и не трогает учётку без пароля', async () => {
    const owner = await createTestEmployee({ role: 'owner' });
    const admin = await createTestEmployee({
      role: 'admin',
      passwordHash: await hashPassword(PASSWORD),
      passwordChangedAt: new Date(Date.now() - HOUR_MS),
    });
    const cookieValue = sessionCookieFor(admin.employeeId, new Date(Date.now() - MINUTE_MS));
    const asOwner = { employeeId: owner.employeeId, role: 'owner' as const };

    expect((await authenticateEmployee({ cookieValue, initData: null })).outcome).toBe(
      'authenticated',
    );

    expect(await resetEmployeePassword({ actor: asOwner, employeeId: admin.employeeId })).toBe('reset');

    const afterReset = await readTestEmployee(admin.employeeId);

    // Признак «пароль задан» в Mini App считается ровно от этой колонки (`readEmployeeScreen.ts`):
    // пустая — пункт задания пароля снова на экране.
    expect(afterReset?.passwordHash).toBeNull();
    expect((await authenticateEmployee({ cookieValue, initData: null })).outcome).toBe(
      'sessions_revoked',
    );

    // Второй сброс ничего не пишет: отметка годности сессий стоит на месте.
    expect(await resetEmployeePassword({ actor: asOwner, employeeId: admin.employeeId })).toBe('reset');
    expect((await readTestEmployee(admin.employeeId))?.sessionsValidFrom).toEqual(
      afterReset?.sessionsValidFrom,
    );
  });

  it('сбросить пароль себе, равному и владельцу нельзя', async () => {
    const owner = await createTestEmployee({ role: 'owner', passwordHash: 'x', telegramUserId: null });
    const admin = await createTestEmployee({ role: 'admin', passwordHash: 'x' });
    const secondAdmin = await createTestEmployee({ role: 'admin', passwordHash: 'x' });
    const asAdmin = { employeeId: admin.employeeId, role: 'admin' as const };

    expect(await resetEmployeePassword({ actor: asAdmin, employeeId: admin.employeeId })).toBe('forbidden');
    expect(await resetEmployeePassword({ actor: asAdmin, employeeId: secondAdmin.employeeId })).toBe('forbidden');
    expect(await resetEmployeePassword({ actor: asAdmin, employeeId: owner.employeeId })).toBe('forbidden');
    expect(
      await resetEmployeePassword({
        actor: { employeeId: owner.employeeId, role: 'owner' },
        employeeId: owner.employeeId,
      }),
    ).toBe('forbidden');

    expect((await readTestEmployee(secondAdmin.employeeId))?.passwordHash).toBe('x');
  });

  it('владелец не заводится на телефон с активной водительской привязкой', async () => {
    const driver = await createTestPerson({ inProgram: true });
    const phone = nextTestPhone();
    const chatId = nextTestTelegramUserId();

    await setTestProfilePhone(driver.profileId, phone);
    await linkTestDriver(driver.personId, chatId, chatId);

    const result = await createOwner({ phoneRaw: phone, fullName: 'Владелец Парка', password: PASSWORD });

    expect(result.outcome).toBe('driver_link_exists');
    expect(await db.employee.findUnique({ where: { phoneE164: phone } })).toBeNull();
  });
});
