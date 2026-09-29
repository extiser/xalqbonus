import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { db } from '#server/db';
import { markEmployeeInviteAccepted, markEmployeeInviteRevoked } from '#server/repositories/employeeInvites';
import { replaceOfficeEmployees } from '#server/repositories/offices';
import { authenticateEmployee } from '#server/services/employees/authenticate';
import { changeEmployeeRole } from '#server/services/employees/changeEmployeeRole';
import { INVITE_LIFETIME_MS, PASSWORD_LINK_LIFETIME_MS } from '#server/services/employees/config';
import { consumePasswordLink } from '#server/services/employees/consumePasswordLink';
import { createOwner } from '#server/services/employees/createOwner';
import { hashPassword, verifyPassword } from '#server/services/employees/password';
import { readPasswordLink } from '#server/services/employees/readPasswordLink';
import { readEmployeeAccounts } from '#server/services/employees/readEmployeeAccounts';
import { readPendingInvites } from '#server/services/employees/readPendingInvites';
import { resetEmployeePassword } from '#server/services/employees/resetEmployeePassword';
import { setEmployeeDisabled } from '#server/services/employees/setEmployeeDisabled';
import { OfficeEmployeeRankError } from '#server/services/offices/errors';
import { readOfficeCandidates } from '#server/services/offices/readOfficeCandidates';
import { readOfficeCard } from '#server/services/offices/readOfficeCard';
import { setOfficeEmployees } from '#server/services/offices/setOfficeEmployees';
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
  insertTestInvite,
  issueTestAccessLink,
  linkTestDriver,
  nextTestPhone,
  nextTestTelegramUserId,
  readAccessLinkByToken,
  readInviteById,
  readTestEmployee,
  setTestProfilePhone,
} from '../support/employees';

/**
 * Экран сотрудников со стороны сервисов: список учёток и висящих приглашений, выключение
 * и включение, сброс пароля со ссылкой «задать пароль» (issue #267) и отказ `createOwner`
 * на телефоне водителя (issue #132).
 *
 * Каждый новый сырой запрос прогоняется здесь в настоящую базу — через сервис, которым его
 * читает ручка (docs/infra.md → «Тесты», сырой SQL).
 */

const HOUR_MS = 60 * 60 * 1_000;
const MINUTE_MS = 60 * 1_000;
const PASSWORD = 'довольно-длинный-пароль';
const NEW_PASSWORD = 'совсем-другой-пароль';
const APP_ORIGIN = 'https://bonus.example';
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
): Promise<string> => (await insertTestInvite({ invitedById, role, expiresAt })).inviteId;

/** Токен из ссылки «задать пароль». */
const tokenOf = (link: string): string => link.slice(`${APP_ORIGIN}/set-password/`.length);

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
      appOrigin: APP_ORIGIN,
    });
    const byId = new Map(asAdmin.employees.map((account) => [account.employeeId, account]));

    expect(asAdmin.invitableRoles).toEqual(['senior_manager', 'manager']);

    expect(byId.get(manager.employeeId)).toEqual({
      employeeId: manager.employeeId,
      fullName: 'Тестовый Сотрудник',
      role: 'manager',
      phoneE164: manager.phoneE164,
      disabled: true,
      passwordSet: false,
      passwordLink: null,
      telegramBound: true,
      // Право выпуска ссылки привязки — то же, что `manageable`; Telegram у фикстуры уже есть.
      telegramLinkIssuable: true,
      telegramLink: null,
      // Работающий офис первым, архивный последним — порядок решает запрос.
      offices: [
        { officeId: activeOffice, name: 'Тестовый офис', archived: false },
        { officeId: archivedOffice, name: 'Тестовый офис', archived: true },
      ],
      anyOffice: false,
      isDemo: false,
      manageable: true,
      // Роли строго ниже своей, кроме нынешней.
      assignableRoles: ['senior_manager'],
    });

    // Равный ранг и старший — без права: себя и владельца админ не трогает.
    expect(byId.get(admin.employeeId)).toMatchObject({
      passwordSet: true,
      offices: [],
      anyOffice: true,
      manageable: false,
      assignableRoles: [],
    });
    expect(byId.get(owner.employeeId)).toMatchObject({ anyOffice: true, manageable: false });

    const asOwner = await readEmployeeAccounts({
      actor: { employeeId: owner.employeeId, role: 'owner' },
      appOrigin: APP_ORIGIN,
    });

    expect(asOwner.invitableRoles).toEqual(['admin', 'senior_manager', 'manager']);
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
      appOrigin: APP_ORIGIN,
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
    expect(manager?.link?.startsWith(`${APP_ORIGIN}/invite/`)).toBe(true);
    expect(new Date(manager?.expiresAt ?? '').getTime()).toBe(live);
    // Приглашение на админа админ видит, но ни отозвать, ни скопировать не вправе: ссылка
    // завела бы учётку с ролью, которую он выпускать не может.
    expect(adminInvite).toMatchObject({ revocable: false, link: null });
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

  it('сброс пароля гасит cookie, обнуляет пароль и выпускает ссылку «задать пароль»', async () => {
    const owner = await createTestEmployee({ role: 'owner' });
    const admin = await createTestEmployee({
      role: 'admin',
      passwordHash: await hashPassword(PASSWORD),
      passwordChangedAt: new Date(Date.now() - HOUR_MS),
      // Без Telegram: пароль у такой учётки единственный вход, и сброс её больше не обходит.
      telegramUserId: null,
    });
    const cookieValue = sessionCookieFor(admin.employeeId, new Date(Date.now() - MINUTE_MS));
    const asOwner = { employeeId: owner.employeeId, role: 'owner' as const };

    expect((await authenticateEmployee({ cookieValue, initData: null })).outcome).toBe(
      'authenticated',
    );

    const reset = await resetEmployeePassword({ actor: asOwner, employeeId: admin.employeeId, appOrigin: APP_ORIGIN });

    expect(reset.outcome).toBe('reset');

    if (reset.outcome !== 'reset') {
      return;
    }

    expect(reset.link.startsWith(`${APP_ORIGIN}/set-password/`)).toBe(true);

    const afterReset = await readTestEmployee(admin.employeeId);

    expect(afterReset?.passwordHash).toBeNull();
    expect((await authenticateEmployee({ cookieValue, initData: null })).outcome).toBe(
      'sessions_revoked',
    );

    // Ссылка видна в списке тому, кто вправе сбросить, и больше никому.
    const asOwnerList = await readEmployeeAccounts({ actor: asOwner, appOrigin: APP_ORIGIN });

    expect(asOwnerList.employees.find((account) => account.employeeId === admin.employeeId)?.passwordLink).toEqual({
      link: reset.link,
      expiresAt: reset.expiresAt.toISOString(),
    });

    // Второй сброс сессии не гасит второй раз, а ссылку выпускает новую и отзывает прежнюю.
    const again = await resetEmployeePassword({ actor: asOwner, employeeId: admin.employeeId, appOrigin: APP_ORIGIN });

    expect((await readTestEmployee(admin.employeeId))?.sessionsValidFrom).toEqual(afterReset?.sessionsValidFrom);
    expect((await readPasswordLink(tokenOf(reset.link))).outcome).toBe('revoked');
    expect(again.outcome).toBe('reset');
  });

  it('по ссылке «задать пароль» задаётся новый пароль и открывается сессия, второй раз ссылка не работает', async () => {
    const owner = await createTestEmployee({ role: 'owner' });
    const manager = await createTestEmployee({ role: 'manager', passwordHash: await hashPassword(PASSWORD) });
    const reset = await resetEmployeePassword({
      actor: { employeeId: owner.employeeId, role: 'owner' },
      employeeId: manager.employeeId,
      appOrigin: APP_ORIGIN,
    });

    if (reset.outcome !== 'reset') {
      throw new Error(`сброс не выпустил ссылку: ${reset.outcome}`);
    }

    const token = tokenOf(reset.link);

    expect(await readPasswordLink(token)).toMatchObject({ outcome: 'live', phoneE164: manager.phoneE164 });
    expect((await consumePasswordLink({ token, password: 'коротко' })).outcome).toBe('password_too_short');

    const consumed = await consumePasswordLink({ token, password: NEW_PASSWORD });

    expect(consumed.outcome).toBe('changed');

    if (consumed.outcome !== 'changed') {
      return;
    }

    const updated = await readTestEmployee(manager.employeeId);

    expect(await verifyPassword(updated?.passwordHash ?? '', NEW_PASSWORD)).toBe(true);
    expect(await verifyPassword(updated?.passwordHash ?? '', PASSWORD)).toBe(false);
    expect((await readAccessLinkByToken(token))?.token).toBeNull();

    // Cookie, выданный вместе с паролем, отметкой годности не гаснет: выпущен в ту же секунду.
    const cookieValue = signEmployeeSession(consumed.session, SESSION_SECRET);

    expect((await authenticateEmployee({ cookieValue, initData: null })).outcome).toBe('authenticated');

    expect((await consumePasswordLink({ token, password: NEW_PASSWORD })).outcome).toBe('used');
  });

  it('истёкшая ссылка «задать пароль» не работает, выключенной учётке пароль не задаётся', async () => {
    const manager = await createTestEmployee({ role: 'manager' });
    const expired = await issueTestAccessLink(
      manager.employeeId,
      'password',
      PASSWORD_LINK_LIFETIME_MS,
      new Date(Date.now() - PASSWORD_LINK_LIFETIME_MS - MINUTE_MS),
    );

    expect((await consumePasswordLink({ token: expired, password: NEW_PASSWORD })).outcome).toBe('expired');

    const disabled = await createTestEmployee({ role: 'manager', disabledAt: new Date() });
    const live = await issueTestAccessLink(disabled.employeeId, 'password', PASSWORD_LINK_LIFETIME_MS);

    expect((await consumePasswordLink({ token: live, password: NEW_PASSWORD })).outcome).toBe('disabled');
    expect((await readTestEmployee(disabled.employeeId))?.passwordHash).toBeNull();
    // Ссылка привязки Telegram на странице пароля — не та ссылка.
    const telegram = await issueTestAccessLink(manager.employeeId, 'telegram', PASSWORD_LINK_LIFETIME_MS);

    expect((await readPasswordLink(telegram)).outcome).toBe('not_found');
  });

  it('сбросить пароль себе, равному и владельцу нельзя', async () => {
    const owner = await createTestEmployee({ role: 'owner', passwordHash: 'x', telegramUserId: null });
    const admin = await createTestEmployee({ role: 'admin', passwordHash: 'x' });
    const secondAdmin = await createTestEmployee({ role: 'admin', passwordHash: 'x' });
    const asAdmin = { employeeId: admin.employeeId, role: 'admin' as const };

    const outcomeOf = async (actor: { employeeId: string; role: 'owner' | 'admin' }, employeeId: string) =>
      (await resetEmployeePassword({ actor, employeeId, appOrigin: APP_ORIGIN })).outcome;

    expect(await outcomeOf(asAdmin, admin.employeeId)).toBe('forbidden');
    expect(await outcomeOf(asAdmin, secondAdmin.employeeId)).toBe('forbidden');
    expect(await outcomeOf(asAdmin, owner.employeeId)).toBe('forbidden');
    expect(await outcomeOf({ employeeId: owner.employeeId, role: 'owner' }, owner.employeeId)).toBe('forbidden');

    expect((await readTestEmployee(secondAdmin.employeeId))?.passwordHash).toBe('x');
  });

  it('смена роли: действующий старше прежней и новой роли, новая действует тем же cookie', async () => {
    const owner = await createTestEmployee({ role: 'owner' });
    const admin = await createTestEmployee({ role: 'admin' });
    const secondAdmin = await createTestEmployee({ role: 'admin' });
    const manager = await createTestEmployee({ role: 'manager' });
    const asOwner = { employeeId: owner.employeeId, role: 'owner' as const };
    const asAdmin = { employeeId: admin.employeeId, role: 'admin' as const };
    const cookieValue = sessionCookieFor(manager.employeeId, new Date(Date.now() - MINUTE_MS));

    const outcomeOf = async (
      actor: { employeeId: string; role: 'owner' | 'admin' | 'senior_manager' },
      employeeId: string,
      role: 'owner' | 'admin' | 'senior_manager' | 'manager',
    ) => (await changeEmployeeRole({ actor, employeeId, role })).outcome;

    expect(await outcomeOf(asOwner, manager.employeeId, 'senior_manager')).toBe('changed');

    // Роль читается из базы, а не из cookie: тот же cookie с `manager` внутри — уже старший менеджер,
    // и сессии смена роли не гасит.
    const promoted = await authenticateEmployee({ cookieValue, initData: null });

    expect(promoted.outcome === 'authenticated' ? promoted.employee.role : promoted.outcome).toBe('senior_manager');
    expect((await readTestEmployee(manager.employeeId))?.sessionsValidFrom).toBeNull();

    expect(await outcomeOf(asAdmin, manager.employeeId, 'manager')).toBe('changed');
    expect(await outcomeOf(asAdmin, manager.employeeId, 'senior_manager')).toBe('changed');
    // Повтор той же роли — тот же успех.
    expect(await outcomeOf(asAdmin, manager.employeeId, 'senior_manager')).toBe('changed');

    // Админ не делает никого админом и не трогает другого админа; себе роль не меняется;
    // `owner` не назначается и не снимается.
    expect(await outcomeOf(asAdmin, manager.employeeId, 'admin')).toBe('forbidden');
    expect(await outcomeOf(asAdmin, secondAdmin.employeeId, 'manager')).toBe('forbidden');
    expect(await outcomeOf(asAdmin, admin.employeeId, 'manager')).toBe('forbidden');
    expect(await outcomeOf(asOwner, owner.employeeId, 'admin')).toBe('forbidden');
    expect(await outcomeOf(asOwner, manager.employeeId, 'owner')).toBe('forbidden');

    // Старший менеджер старше менеджера рангом, но власти над учётками у него нет.
    const senior = { employeeId: manager.employeeId, role: 'senior_manager' as const };
    const otherManager = await createTestEmployee({ role: 'manager' });

    expect(await outcomeOf(senior, otherManager.employeeId, 'manager')).toBe('forbidden');

    expect(
      await outcomeOf(asOwner, '00000000-0000-4000-8000-000000000000', 'manager'),
    ).toBe('not_found');

    expect((await readTestEmployee(manager.employeeId))?.role).toBe('senior_manager');
    expect((await readTestEmployee(secondAdmin.employeeId))?.role).toBe('admin');
  });

  it('закрепление за офисом — только строго ниже своей: добавить и снять', async () => {
    const officeId = await createTestOffice();
    officeIds.push(officeId);

    const senior = await createTestEmployee({ role: 'senior_manager' });
    const admin = await createTestEmployee({ role: 'admin' });
    const manager = await createTestEmployee({ role: 'manager' });
    const secondManager = await createTestEmployee({ role: 'manager' });
    const asSenior = { employeeId: senior.employeeId, role: 'senior_manager' as const };
    const idsOf = (response: { employees: { employeeId: string }[] }) =>
      response.employees.map((employee) => employee.employeeId).sort();

    // Кандидаты старшему менеджеру — только менеджеры: ни админа, ни себя.
    const candidates = new Set(
      (await readOfficeCandidates(officeId, asSenior))?.candidates.map((candidate) => candidate.employeeId),
    );

    expect(candidates.has(manager.employeeId)).toBe(true);
    expect(candidates.has(admin.employeeId)).toBe(false);
    expect(candidates.has(senior.employeeId)).toBe(false);

    // Добавить менеджера — да.
    expect(idsOf(await setOfficeEmployees(officeId, [manager.employeeId], asSenior))).toEqual([manager.employeeId]);

    // Добавить админа — отказ, состав не меняется.
    await expect(
      setOfficeEmployees(officeId, [manager.employeeId, admin.employeeId], asSenior),
    ).rejects.toBeInstanceOf(OfficeEmployeeRankError);

    // Админа закрепляет тот, кто выше него.
    await replaceOfficeEmployees(officeId, [manager.employeeId, admin.employeeId], db);

    // Снять админа — отказ; у него на карточке нет «Снять», у менеджера есть.
    await expect(setOfficeEmployees(officeId, [manager.employeeId], asSenior)).rejects.toBeInstanceOf(
      OfficeEmployeeRankError,
    );

    const card = await readOfficeCard(officeId, asSenior);
    const removable = new Map(card?.employees.map((employee) => [employee.employeeId, employee.removable]));

    expect(removable.get(admin.employeeId)).toBe(false);
    expect(removable.get(manager.employeeId)).toBe(true);

    // Админ остаётся в наборе как был, добавляется новый менеджер — проходит.
    expect(
      idsOf(
        await setOfficeEmployees(
          officeId,
          [manager.employeeId, admin.employeeId, secondManager.employeeId],
          asSenior,
        ),
      ),
    ).toEqual([manager.employeeId, admin.employeeId, secondManager.employeeId].sort());
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
