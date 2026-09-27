import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { db } from '#server/db';
import { insertDemoInvite } from '#server/repositories/demoInvites';
import { acceptDemoInvite } from '#server/services/demo/acceptDemoInvite';
import { addDemoViewer, DEMO_DRIVER_OPENING_BALANCE } from '#server/services/demo/addDemoViewer';
import { createDemoInviteToken, hashDemoInviteToken } from '#server/services/demo/demoInviteToken';
import { generateDemoDrivers } from '#server/services/demo/generateDemoDrivers';
import { hideDemoDriver } from '#server/services/demo/hideDemoDriver';
import { unhideDemoDriver } from '#server/services/demo/unhideDemoDriver';
import { readDemoDriverTrips } from '#server/services/demo/readDemoDriverTrips';
import { readDemoDrivers } from '#server/services/demo/readDemoOverview';
import { NotDemoDriverError } from '#server/services/demo/errors';
import { revokeDemoInvite } from '#server/services/demo/revokeDemoInvite';
import { setDemoManagerOffices } from '#server/services/demo/setDemoManagerOffices';
import { searchDrivers } from '#server/services/drivers/searchDrivers';
import { requireOpenOffice, readEmployeeOffices } from '#server/services/offices/employeeOffices';
import { OfficeNotOpenError, OfficeSideMismatchError } from '#server/services/offices/errors';
import { setOfficeEmployees } from '#server/services/offices/setOfficeEmployees';
import { buildDemoGrantIdempotencyKey } from '#server/services/points/idempotencyKey';
import { previewSegmentConditions } from '#server/services/segments/previewSegment';
import { EMPTY_SEGMENT_CONDITIONS } from '#shared/segment';
import {
  cleanupTestData,
  countTransfersByKey,
  createTestOffice,
  createTestPerson,
  disconnectDatabase,
  readAccountBalance,
} from '../support/database';
import { cleanupTestDemo, trackTestDemoInvite, trackTestDemoPerson, trackTestDemoViewer } from '../support/demo';
import {
  cleanupTestEmployees,
  createTestEmployee,
  linkTestDriver,
  nextTestPhone,
  nextTestTelegramUserId,
  trackTestEmployee,
} from '../support/employees';
import { disconnectQueues } from '../support/queues';

/**
 * Раздел «Демо» (issue #252): генератор кладёт баланс переводом `demo_grant` и нумерует
 * водителей подряд, приглашение принимается один раз и не гаснет на отказе внесения,
 * спрятанный уходит из отбора сегментов и поиска, а закрепление за офисом не пересекает
 * стороны демо.
 *
 * База общая со всеми файлами: сгенерированные этим файлом отбираются временем заведения,
 * а состав сегментов — окном баланса, которого нет ни у кого, кроме них.
 */

const BALANCE_WINDOW = 7_252_000;

/** Участник-источник для демо-водителей: в программе, с привязкой и работающим профилем. */
const createSource = async (): Promise<void> => {
  const source = await createTestPerson({ inProgram: true });

  await linkTestDriver(source.personId, nextTestTelegramUserId());
};

type GeneratedRow = { personId: string; firstName: string; callsign: string; member: boolean };

/** Сгенерированные с этого момента — по порядку заведения; и сразу отдаются уборке. */
const readGeneratedSince = async (since: Date): Promise<GeneratedRow[]> => {
  const rows = await db.$queryRaw<GeneratedRow[]>`
    SELECT person."id"                        AS "personId",
           profile."first_name"               AS "firstName",
           profile."callsign",
           (settings."person_id" IS NOT NULL) AS "member"
      FROM xb.persons AS person
      JOIN xb.park_profiles AS profile ON profile."person_id" = person."id"
      LEFT JOIN xb.person_settings AS settings ON settings."person_id" = person."id"
     WHERE person."is_demo"
       AND person."created_at" >= ${since}
       AND NOT EXISTS (SELECT 1 FROM xb.demo_viewers AS viewer WHERE viewer."person_id" = person."id")
     ORDER BY person."created_at"
  `;

  rows.forEach((row) => trackTestDemoPerson(row.personId));

  return rows;
};

const numberOf = (firstName: string): number => Number(firstName.split(' ').at(-1));

/** Приглашение в обход выпуска: выпуск спрашивает имя бота у Telegram. */
const createInvite = async (expiresAt: Date): Promise<string> => {
  const { employeeId } = await createTestEmployee({ role: 'owner' });
  const token = createDemoInviteToken();
  const invite = await insertDemoInvite({
    label: 'проверка приглашения',
    token,
    tokenHash: hashDemoInviteToken(token),
    invitedById: employeeId,
    expiresAt,
  });

  trackTestDemoInvite(invite.id);

  return token;
};

const inADay = (): Date => new Date(Date.now() + 24 * 60 * 60 * 1_000);

/** Токен, который лежит у приглашения, — по хешу: ссылку показывают только живому. */
const readStoredToken = async (token: string): Promise<string | null | undefined> => {
  const rows = await db.$queryRaw<{ token: string | null }[]>`
    SELECT "token" FROM xb.demo_invites WHERE "token_hash" = ${hashDemoInviteToken(token)}
  `;

  return rows[0]?.token;
};

describe('раздел «Демо»', () => {
  afterEach(async () => {
    await cleanupTestDemo();
    await cleanupTestEmployees();
    await cleanupTestData();
  });
  afterAll(async () => {
    await disconnectDatabase();
    await disconnectQueues();
  });

  it('генератор нумерует подряд и кладёт баланс одним переводом demo_grant', async () => {
    await createSource();
    const since = new Date();

    const result = await generateDemoDrivers({
      count: 3,
      balanceMin: 150,
      balanceMax: 150,
      tripsMin: 0,
      tripsMax: 0,
      lastTripDaysMin: 0,
      lastTripDaysMax: 0,
      programMember: 'no',
    });

    expect(result).toEqual({ created: 3 });

    const generated = await readGeneratedSince(since);
    const numbers = generated.map((row) => numberOf(row.firstName));

    expect(generated).toHaveLength(3);
    expect(numbers).toEqual([numbers[0], (numbers[0] ?? 0) + 1, (numbers[0] ?? 0) + 2]);
    expect(generated.map((row) => row.callsign)).toEqual(numbers.map((number) => `ДЕМО-${number}`));
    expect(generated.every((row) => !row.member)).toBe(true);

    for (const row of generated) {
      expect(await readAccountBalance(row.personId)).toBe(150n);
      expect(await countTransfersByKey(buildDemoGrantIdempotencyKey(row.personId))).toBe(1);
    }
  });

  it('генератор: ноль баланса — без перевода, поездки участнику дают приветственные 300', async () => {
    await createSource();
    const since = new Date();

    await generateDemoDrivers({
      count: 1,
      balanceMin: 0,
      balanceMax: 0,
      tripsMin: 5,
      tripsMax: 5,
      lastTripDaysMin: 3,
      lastTripDaysMax: 3,
      programMember: 'yes',
    });

    const [driver] = await readGeneratedSince(since);

    expect(driver?.member).toBe(true);

    if (!driver) {
      return;
    }

    expect(await countTransfersByKey(buildDemoGrantIdempotencyKey(driver.personId))).toBe(0);
    expect(await readAccountBalance(driver.personId)).toBe(305n);

    const listed = (await readDemoDrivers()).find((row) => row.personId === driver.personId);

    expect(listed?.viewerLabel).toBeNull();
    expect(listed?.balance).toBe(305);
    expect(listed?.lastTripAt).not.toBeNull();
  });

  it('поездки демо-водителя: участнику по +1, не участнику — не начислено, живому — отказ', async () => {
    await createSource();
    const since = new Date();
    const base = {
      balanceMin: 0,
      balanceMax: 0,
      tripsMin: 3,
      tripsMax: 3,
      lastTripDaysMin: 2,
      lastTripDaysMax: 2,
    };

    await generateDemoDrivers({ ...base, count: 1, programMember: 'yes' });
    await generateDemoDrivers({ ...base, count: 1, programMember: 'no' });

    const [member, outsider] = await readGeneratedSince(since);

    if (!member || !outsider) {
      throw new Error('генератор не завёл двоих');
    }

    const memberTrips = await readDemoDriverTrips(member.personId);
    const outsiderTrips = await readDemoDriverTrips(outsider.personId);

    expect(memberTrips.trips.map((trip) => trip.points)).toEqual([1, 1, 1]);
    expect(outsiderTrips.trips.map((trip) => trip.points)).toEqual([null, null, null]);
    // Свежие первыми.
    expect(memberTrips.trips.map((trip) => trip.endedAt)).toEqual(
      [...memberTrips.trips.map((trip) => trip.endedAt)].sort().reverse(),
    );

    const listed = await readDemoDrivers();

    expect(listed.find((row) => row.personId === member.personId)?.tripsCount).toBe(3);
    expect(listed.find((row) => row.personId === outsider.personId)?.tripsCount).toBe(3);

    const livePerson = await createTestPerson({ inProgram: true });

    await expect(readDemoDriverTrips(livePerson.personId)).rejects.toBeInstanceOf(NotDemoDriverError);
  });

  it('генератор отказывает полем, ничего не заводя', async () => {
    await createSource();
    const since = new Date();

    await expect(
      generateDemoDrivers({
        count: 2,
        balanceMin: 500,
        balanceMax: 100,
        tripsMin: 0,
        tripsMax: 0,
        lastTripDaysMin: 0,
        lastTripDaysMax: 0,
        programMember: 'mixed',
      }),
    ).rejects.toMatchObject({ field: 'balanceMax' });

    expect(await readGeneratedSince(since)).toEqual([]);
  });

  it('спрятанный уходит из демо-сегмента и поиска и возвращается туда же; водителя зрителя не прячут', async () => {
    await createSource();
    const since = new Date();

    await generateDemoDrivers({
      count: 2,
      balanceMin: BALANCE_WINDOW,
      balanceMax: BALANCE_WINDOW,
      tripsMin: 0,
      tripsMax: 0,
      lastTripDaysMin: 0,
      lastTripDaysMax: 0,
      programMember: 'yes',
    });

    const [hidden, kept] = await readGeneratedSince(since);

    if (!hidden || !kept) {
      throw new Error('генератор не завёл двоих');
    }

    const conditions = { ...EMPTY_SEGMENT_CONDITIONS, balanceMin: BALANCE_WINDOW, balanceMax: BALANCE_WINDOW };
    const segmentBefore = await previewSegmentConditions(conditions, true, 0);

    expect(segmentBefore.rows.map((row) => row.personId).sort()).toEqual([hidden.personId, kept.personId].sort());
    expect((await previewSegmentConditions(conditions, false, 0)).total).toBe(0);

    const searchBefore = await searchDrivers({ query: hidden.callsign, limit: 100, offset: 0 });

    expect(searchBefore.rows.map((row) => row.personId)).toContain(hidden.personId);

    expect(await hideDemoDriver(hidden.personId)).toBe('hidden');
    expect(await hideDemoDriver(hidden.personId)).toBe('already_hidden');

    const segmentAfter = await previewSegmentConditions(conditions, true, 0);
    const searchAfter = await searchDrivers({ query: hidden.callsign, limit: 100, offset: 0 });
    const listed = await readDemoDrivers();

    expect(segmentAfter.rows.map((row) => row.personId)).toEqual([kept.personId]);
    expect(searchAfter.rows.map((row) => row.personId)).not.toContain(hidden.personId);
    // Раздел показывает спрятанного по переключателю — строкой с отметкой.
    expect(listed.find((row) => row.personId === hidden.personId)?.hiddenAt).not.toBeNull();
    expect(listed.find((row) => row.personId === kept.personId)?.hiddenAt).toBeNull();
    // Журнал не трогается: баланс на месте.
    expect(await readAccountBalance(hidden.personId)).toBe(BigInt(BALANCE_WINDOW));

    // «Вернуть»: снова в разделе, в демо-сегменте и в поиске; повтор — тот же исход.
    expect(await unhideDemoDriver(hidden.personId)).toBe('shown');
    expect(await unhideDemoDriver(hidden.personId)).toBe('shown');

    const segmentBack = await previewSegmentConditions(conditions, true, 0);
    const searchBack = await searchDrivers({ query: hidden.callsign, limit: 100, offset: 0 });

    expect(segmentBack.rows.map((row) => row.personId).sort()).toEqual([hidden.personId, kept.personId].sort());
    expect(searchBack.rows.map((row) => row.personId)).toContain(hidden.personId);
    expect((await readDemoDrivers()).find((row) => row.personId === hidden.personId)?.hiddenAt).toBeNull();

    const telegramUserId = nextTestTelegramUserId();
    const viewer = await addDemoViewer({ telegramUserId, label: 'зритель' });

    if (!('personId' in viewer)) {
      throw new Error(`зритель не внесён: ${viewer.outcome}`);
    }

    trackTestDemoViewer(telegramUserId, viewer.personId);

    expect(await hideDemoDriver(viewer.personId)).toBe('viewer_driver');

    const livePerson = await createTestPerson({ inProgram: true });

    expect(await hideDemoDriver(livePerson.personId)).toBe('not_demo');
    expect(await unhideDemoDriver(livePerson.personId)).toBe('not_demo');
  });

  it('приглашение принимается один раз и заводит зрителя с демо-водителем', async () => {
    await createSource();
    const token = await createInvite(inADay());
    const first = nextTestTelegramUserId();

    const accepted = await acceptDemoInvite({ token, telegramUserId: first });

    expect(accepted.outcome).toBe('accepted');

    if (accepted.outcome !== 'accepted') {
      return;
    }

    trackTestDemoViewer(first, accepted.personId);

    // Принятие стирает токен: ссылку больше не показать.
    expect(await readStoredToken(token)).toBeNull();

    expect(await readAccountBalance(accepted.personId)).toBe(BigInt(DEMO_DRIVER_OPENING_BALANCE));
    expect(await acceptDemoInvite({ token, telegramUserId: nextTestTelegramUserId() })).toEqual({
      outcome: 'invite_used',
    });
  });

  it('отказ внесения ссылку не гасит: её принимает следующий', async () => {
    await createSource();
    const token = await createInvite(inADay());
    const driver = await createTestPerson({ inProgram: true });
    const driverTelegram = nextTestTelegramUserId();

    await linkTestDriver(driver.personId, driverTelegram);

    expect(await acceptDemoInvite({ token, telegramUserId: driverTelegram })).toEqual({
      outcome: 'telegram_linked',
    });
    // Отказ внесения ссылку не гасит — и токен у неё остаётся.
    expect(await readStoredToken(token)).toBe(token);

    const { telegramUserId: employeeTelegram } = await createTestEmployee({ role: 'manager' });

    expect(await acceptDemoInvite({ token, telegramUserId: employeeTelegram ?? 0n })).toEqual({
      outcome: 'telegram_employee',
    });

    const viewerTelegram = nextTestTelegramUserId();
    const accepted = await acceptDemoInvite({ token, telegramUserId: viewerTelegram });

    expect(accepted.outcome).toBe('accepted');

    if (accepted.outcome === 'accepted') {
      trackTestDemoViewer(viewerTelegram, accepted.personId);
    }
  });

  it('неизвестная, просроченная и отозванная ссылки отказывают своим исходом', async () => {
    expect(await acceptDemoInvite({ token: 'нет-такого', telegramUserId: nextTestTelegramUserId() })).toEqual({
      outcome: 'invite_unknown',
    });

    const expired = await createInvite(new Date(Date.now() - 1_000));

    expect(await acceptDemoInvite({ token: expired, telegramUserId: nextTestTelegramUserId() })).toEqual({
      outcome: 'invite_expired',
    });

    const revokedToken = await createInvite(inADay());
    const [revokedInvite] = await db.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM xb.demo_invites WHERE "token_hash" = ${hashDemoInviteToken(revokedToken)}
    `;

    expect(await revokeDemoInvite(revokedInvite?.id ?? '')).toBe('revoked');
    expect(await readStoredToken(revokedToken)).toBeNull();
    expect(await revokeDemoInvite(revokedInvite?.id ?? '')).toBe('not_pending');
    expect(await acceptDemoInvite({ token: revokedToken, telegramUserId: nextTestTelegramUserId() })).toEqual({
      outcome: 'invite_revoked',
    });
  });

  it('закрепление за офисом не пересекает стороны демо', async () => {
    const liveOfficeId = await createTestOffice();
    const demoOfficeId = await createTestOffice();
    const { employeeId: liveEmployeeId } = await createTestEmployee({ role: 'manager' });
    // Демо-сотрудник — вставкой: своего входа у него нет, а фикстура заводит учётку со входом.
    // Роль — админ: демо-менеджер один на роль, и в общей базе он может уже быть.
    const [demoEmployee] = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO xb.employees ("role", "full_name", "phone_e164", "is_demo")
      VALUES ('admin', 'Тестовый Демо', ${nextTestPhone()}, true)
      RETURNING "id"
    `;
    const demoEmployeeId = demoEmployee?.id ?? '';

    trackTestEmployee(demoEmployeeId);

    await db.$executeRaw`UPDATE xb.offices SET "is_demo" = true WHERE "id" = ${demoOfficeId}::uuid`;

    await expect(setOfficeEmployees(liveOfficeId, [demoEmployeeId])).rejects.toBeInstanceOf(OfficeSideMismatchError);
    await expect(setOfficeEmployees(demoOfficeId, [liveEmployeeId])).rejects.toBeInstanceOf(OfficeSideMismatchError);

    expect((await setOfficeEmployees(demoOfficeId, [demoEmployeeId])).employees.map((row) => row.employeeId)).toEqual([
      demoEmployeeId,
    ]);

    await db.$executeRaw`DELETE FROM xb.employee_offices WHERE "office_id" = ${demoOfficeId}::uuid`;
  });

  it('стойка открывает офисы только своей стороны: владельцу — живые, демо-сотруднику — его демо', async () => {
    const liveOfficeId = await createTestOffice();
    const demoOfficeId = await createTestOffice();
    const { employeeId: ownerId } = await createTestEmployee({ role: 'owner' });
    const [demoEmployee] = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO xb.employees ("role", "full_name", "phone_e164", "is_demo")
      VALUES ('admin', 'Тестовый Демо', ${nextTestPhone()}, true)
      RETURNING "id"
    `;
    const demoEmployeeId = demoEmployee?.id ?? '';

    trackTestEmployee(demoEmployeeId);

    await db.$executeRaw`UPDATE xb.offices SET "is_demo" = true WHERE "id" = ${demoOfficeId}::uuid`;

    const owner = { employeeId: ownerId, role: 'owner' as const, isDemo: false };
    const ownerOffices = (await readEmployeeOffices(owner)).map((office) => office.officeId);

    expect(ownerOffices).toContain(liveOfficeId);
    expect(ownerOffices).not.toContain(demoOfficeId);
    await expect(requireOpenOffice(owner, demoOfficeId)).rejects.toBeInstanceOf(OfficeNotOpenError);

    // Демо-сотрудник «любого офиса» — только демо-офисы: живой ему не открыт.
    const demo = { employeeId: demoEmployeeId, role: 'admin' as const, isDemo: true };
    const demoOffices = (await readEmployeeOffices(demo)).map((office) => office.officeId);

    expect(demoOffices).toContain(demoOfficeId);
    expect(demoOffices).not.toContain(liveOfficeId);
    expect((await requireOpenOffice(demo, demoOfficeId)).officeId).toBe(demoOfficeId);
    await expect(requireOpenOffice(demo, liveOfficeId)).rejects.toBeInstanceOf(OfficeNotOpenError);
  });

  it('демо-менеджер: офисы только демо, стойка показывает отмеченные и не открывает живой', async () => {
    const liveOfficeId = await createTestOffice();
    const demoOfficeId = await createTestOffice();
    const otherDemoOfficeId = await createTestOffice();

    await db.$executeRaw`
      UPDATE xb.offices SET "is_demo" = true WHERE "id" IN (${demoOfficeId}::uuid, ${otherDemoOfficeId}::uuid)
    `;

    // Демо-менеджер один на базу (`employees_demo_role_key`); в тестовой базе его не заводит
    // никто, кроме этого теста.
    const [demoManager] = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO xb.employees ("role", "full_name", "phone_e164", "is_demo")
      VALUES ('manager', 'Тестовый Демо-менеджер', ${nextTestPhone()}, true)
      RETURNING "id"
    `;
    const employeeId = demoManager?.id ?? '';

    trackTestEmployee(employeeId);

    await expect(setDemoManagerOffices([liveOfficeId])).rejects.toBeInstanceOf(OfficeSideMismatchError);
    expect(await setDemoManagerOffices([demoOfficeId])).toEqual({ officeIds: [demoOfficeId] });

    // Живой офис, закреплённый до проверки стороны, стойку не открывает.
    await db.$executeRaw`
      INSERT INTO xb.employee_offices ("employee_id", "office_id") VALUES (${employeeId}::uuid, ${liveOfficeId}::uuid)
    `;

    const manager = { employeeId, role: 'manager' as const, isDemo: true };

    expect((await readEmployeeOffices(manager)).map((office) => office.officeId)).toEqual([demoOfficeId]);
    await expect(requireOpenOffice(manager, liveOfficeId)).rejects.toBeInstanceOf(OfficeNotOpenError);
    await expect(requireOpenOffice(manager, otherDemoOfficeId)).rejects.toBeInstanceOf(OfficeNotOpenError);

    await db.$executeRaw`DELETE FROM xb.employee_offices WHERE "employee_id" = ${employeeId}::uuid`;
  });
});
