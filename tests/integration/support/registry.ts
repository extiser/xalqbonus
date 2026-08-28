import { db } from '#server/db';

/**
 * Фикстуры и уборка для тестов синхронизации реестра парка.
 *
 * Тесты ходят в настоящую базу: проверяется ровно то, чего в заглушке нет — частичные
 * уникальные индексы на активное удостоверение и активный телефон, внешние ключи журналов
 * и то, что повторный прогон не плодит строк. Заглушка подтвердила бы работу кода,
 * а не работу реестра.
 *
 * Уборка идёт по префиксу идентификатора профиля и по прогонам, заведённым тестом:
 * `TRUNCATE` снёс бы заодно и всё, что положили соседние файлы тестов.
 */

/** Все профили тестов реестра начинаются с этого. По нему же идёт уборка. */
export const TEST_PROFILE_PREFIX = 'test-registry-';

/** Прогоны, заведённые фикстурами. Прогоны самой синхронизации убираются по виду. */
const createdRunIds = new Set<string>();

export type RawProfileInput = {
  profileId: string;
  licenseNumber?: string | null;
  workStatus?: string;
  workRuleId?: string;
  phones?: string[];
  firstName?: string;
  updatedAt?: string;
  createdDate?: string;
  currentStatus?: string;
  employmentType?: string;
  carNumber?: string;
};

/**
 * Запись списка профилей в том виде, в каком её отдаёт Fleet API.
 *
 * Строится по образцу живого ответа `_reference/fleet-api/samples/driver-profiles-*.json`,
 * а не по странице документации: состав полей мы берём из живых ответов
 * (docs/yandex-fleet.md).
 */
export const buildRawProfile = (input: RawProfileInput): Record<string, unknown> => {
  const driverProfile: Record<string, unknown> = {
    id: input.profileId,
    park_id: 'test-park',
    first_name: input.firstName ?? 'Тест',
    last_name: 'Тестов',
    work_status: input.workStatus ?? 'working',
    employment_type: input.employmentType ?? 'selfemployed',
    is_selfemployed: true,
    work_rule_id: input.workRuleId ?? 'test-work-rule',
    created_date: input.createdDate ?? '2020-01-01T00:00:00+00:00',
    modified_date: '2026-08-01T00:00:00+00:00',
    phones: input.phones ?? ['+998901234567'],
  };

  // `null` в номере — это профиль вовсе без объекта удостоверения: разбор такого профиля
  // спотыкается, и он обязан лечь строкой в журнал пропущенного, а не уронить прогон.
  if (input.licenseNumber !== null) {
    driverProfile['driver_license'] = {
      number: input.licenseNumber ?? 'AA1234567',
      country: 'uzb',
      issue_date: '2015-01-01T00:00:00+00:00',
      expiration_date: '2030-01-01T00:00:00+00:00',
    };
  }

  return {
    updated_at: input.updatedAt ?? '2026-08-28T11:00:00+00:00',
    driver_profile: driverProfile,
    current_status: { status: input.currentStatus ?? 'offline' },
    car: {
      id: 'test-car',
      number: input.carNumber ?? '01A123AA',
      callsign: '1234',
      brand: 'Chevrolet',
      model: 'Cobalt',
    },
  };
};

export type ParkProfileRow = {
  profileId: string;
  personId: string;
  workStatus: string;
  firstName: string;
  carNumber: string | null;
  apiUpdatedAt: Date;
  lastSyncedAt: Date;
};

export const readParkProfile = async (profileId: string): Promise<ParkProfileRow | null> => {
  const rows = await db.$queryRaw<ParkProfileRow[]>`
    SELECT "profile_id"     AS "profileId",
           "person_id"      AS "personId",
           "work_status"    AS "workStatus",
           "first_name"     AS "firstName",
           "car_number"     AS "carNumber",
           "api_updated_at" AS "apiUpdatedAt",
           "last_synced_at" AS "lastSyncedAt"
      FROM xb.park_profiles
     WHERE "profile_id" = ${profileId}
  `;

  return rows[0] ?? null;
};

export type StatusEventRow = {
  statusFrom: string | null;
  statusTo: string;
  syncRunId: string | null;
};

export const readStatusEvents = async (profileId: string): Promise<StatusEventRow[]> =>
  db.$queryRaw<StatusEventRow[]>`
    SELECT "status_from" AS "statusFrom", "status_to" AS "statusTo", "sync_run_id" AS "syncRunId"
      FROM xb.profile_status_events
     WHERE "profile_id" = ${profileId}
     ORDER BY "observed_at", "status_to"
  `;

export type PhoneRow = {
  phoneRaw: string;
  phoneE164: string | null;
  closedAt: Date | null;
};

export const readPhones = async (profileId: string): Promise<PhoneRow[]> =>
  db.$queryRaw<PhoneRow[]>`
    SELECT "phone_raw" AS "phoneRaw", "phone_e164" AS "phoneE164", "closed_at" AS "closedAt"
      FROM xb.profile_phones
     WHERE "profile_id" = ${profileId}
     ORDER BY "phone_raw"
  `;

export type LicenseRow = {
  numberCanonical: string;
  numberRaw: string;
  source: string;
  closedAt: Date | null;
};

export const readLicenses = async (personId: string): Promise<LicenseRow[]> =>
  db.$queryRaw<LicenseRow[]>`
    SELECT "number_canonical" AS "numberCanonical",
           "number_raw"       AS "numberRaw",
           "source",
           "closed_at"        AS "closedAt"
      FROM xb.person_licenses
     WHERE "person_id" = ${personId}::uuid
     ORDER BY "observed_at", "number_canonical"
  `;

/** Сколько людей знает база. Тест на двойников считает именно всех, а не своих. */
export const countPersons = async (): Promise<number> => {
  const rows = await db.$queryRaw<{ total: bigint }[]>`SELECT COUNT(*) AS total FROM xb.persons`;

  return Number(rows[0]?.total ?? 0n);
};

/** Заводит человека с активным удостоверением — так, как его завёл бы перенос реестра. */
export const createPersonWithLicense = async (numberCanonical: string): Promise<string> => {
  const rows = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO xb.persons DEFAULT VALUES RETURNING "id"
  `;
  const personId = rows[0]?.id as string;

  await db.$executeRaw`
    INSERT INTO xb.person_licenses ("person_id", "number_raw", "number_canonical", "source")
    VALUES (${personId}::uuid, ${numberCanonical}, ${numberCanonical}, 'legacy_import')
  `;

  return personId;
};

/**
 * Кладёт заказ в журнал пропущенного как «водитель неизвестен» — ровно так, как это делает
 * прогон синхронизации заказов, наткнувшись на профиль, которого нет в реестре.
 */
export const insertUnknownProfileSkip = async (
  orderId: string,
  profileId: string,
): Promise<void> => {
  const rows = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO xb.sync_runs ("kind", "status")
    VALUES ('orders'::xb.sync_kind, 'succeeded'::xb.sync_status)
    RETURNING "id"
  `;
  const runId = rows[0]?.id as string;
  createdRunIds.add(runId);

  await db.$executeRaw`
    INSERT INTO xb.sync_skips ("reason", "reference", "detail", "first_run_id", "last_run_id")
    VALUES (
      'unknown_profile'::xb.sync_skip_reason,
      ${orderId},
      ${profileId},
      ${runId}::uuid,
      ${runId}::uuid
    )
  `;
};

export type SkipRow = {
  reason: string;
  reference: string;
  detail: string | null;
  timesSeen: number;
  resolvedAt: Date | null;
};

export const readSkips = async (): Promise<SkipRow[]> =>
  db.$queryRaw<SkipRow[]>`
    SELECT "reason"::text AS "reason",
           "reference",
           "detail",
           "times_seen"  AS "timesSeen",
           "resolved_at" AS "resolvedAt"
      FROM xb.sync_skips
     ORDER BY "reason", "reference"
  `;

export type SyncRunRegistryRow = {
  pages: number;
  profilesSeen: number;
  profilesInserted: number;
  profilesUpdated: number;
  personsCreated: number;
  statusEvents: number;
  phonesOpened: number;
  phonesClosed: number;
  licensesUpdated: number;
  licenseConflicts: number;
  skippedWithoutLicense: number;
  malformed: number;
  resolvedSkips: number;
  chunksTotal: number;
  chunksWindowed: number;
  maxOffsetDepth: number;
};

export const readSyncRunRegistry = async (runId: string): Promise<SyncRunRegistryRow | null> => {
  const rows = await db.$queryRaw<SyncRunRegistryRow[]>`
    SELECT "pages",
           "profiles_seen"           AS "profilesSeen",
           "profiles_inserted"       AS "profilesInserted",
           "profiles_updated"        AS "profilesUpdated",
           "persons_created"         AS "personsCreated",
           "status_events"           AS "statusEvents",
           "phones_opened"           AS "phonesOpened",
           "phones_closed"           AS "phonesClosed",
           "licenses_updated"        AS "licensesUpdated",
           "license_conflicts"       AS "licenseConflicts",
           "skipped_without_license" AS "skippedWithoutLicense",
           "malformed",
           "resolved_skips"          AS "resolvedSkips",
           "chunks_total"            AS "chunksTotal",
           "chunks_windowed"         AS "chunksWindowed",
           "max_offset_depth"        AS "maxOffsetDepth"
      FROM xb.sync_run_registry
     WHERE "run_id" = ${runId}::uuid
  `;

  return rows[0] ?? null;
};

/**
 * Убирает всё, что оставил тест реестра.
 *
 * Порядок идёт по ссылкам: внешние ключи журнала стоят на `RESTRICT`, и это намеренно —
 * журнал прогонов не должен уходить молча вслед за строкой прогона.
 */
export const resetRegistryData = async (): Promise<void> => {
  const profileFilter = `${TEST_PROFILE_PREFIX}%`;
  const fixtureRunIds = [...createdRunIds];
  createdRunIds.clear();

  const owners = await db.$queryRaw<{ personId: string }[]>`
    SELECT DISTINCT "person_id" AS "personId"
      FROM xb.park_profiles
     WHERE "profile_id" LIKE ${profileFilter}
  `;
  const personIds = owners.map((row) => row.personId);

  await db.$executeRaw`DELETE FROM xb.sync_state WHERE "kind" IN ('registry', 'registry_full')`;
  await db.$executeRaw`
    DELETE FROM xb.sync_skips
     WHERE "first_run_id" = ANY(${fixtureRunIds}::uuid[])
        OR "last_run_id"  = ANY(${fixtureRunIds}::uuid[])
        OR "first_run_id" IN (SELECT "id" FROM xb.sync_runs WHERE "kind" IN ('registry', 'registry_full'))
        OR "last_run_id"  IN (SELECT "id" FROM xb.sync_runs WHERE "kind" IN ('registry', 'registry_full'))
  `;
  await db.$executeRaw`
    DELETE FROM xb.sync_run_registry
     WHERE "run_id" IN (SELECT "id" FROM xb.sync_runs WHERE "kind" IN ('registry', 'registry_full'))
  `;
  await db.$executeRaw`DELETE FROM xb.profile_status_events WHERE "profile_id" LIKE ${profileFilter}`;
  await db.$executeRaw`DELETE FROM xb.profile_phones WHERE "profile_id" LIKE ${profileFilter}`;
  await db.$executeRaw`DELETE FROM xb.park_profiles WHERE "profile_id" LIKE ${profileFilter}`;
  await db.$executeRaw`DELETE FROM xb.sync_runs WHERE "kind" IN ('registry', 'registry_full')`;
  await db.$executeRaw`DELETE FROM xb.sync_runs WHERE "id" = ANY(${fixtureRunIds}::uuid[])`;

  if (personIds.length > 0) {
    await db.$executeRaw`DELETE FROM xb.person_licenses WHERE "person_id" = ANY(${personIds}::uuid[])`;
    await db.$executeRaw`DELETE FROM xb.person_settings WHERE "person_id" = ANY(${personIds}::uuid[])`;
    await db.$executeRaw`DELETE FROM xb.persons WHERE "id" = ANY(${personIds}::uuid[])`;
  }

  // Человек, заведённый фикстурой под будущий профиль, до профиля мог и не дожить:
  // тест на двойников проверяет как раз то, что второго человека не появилось.
  await db.$executeRaw`
    DELETE FROM xb.person_licenses
     WHERE "person_id" IN (
           SELECT person."id"
             FROM xb.persons AS person
            WHERE NOT EXISTS (SELECT 1 FROM xb.park_profiles AS profile WHERE profile."person_id" = person."id")
              AND NOT EXISTS (SELECT 1 FROM xb.accounts AS account WHERE account."person_id" = person."id")
     )
  `;
  await db.$executeRaw`
    DELETE FROM xb.persons AS person
     WHERE NOT EXISTS (SELECT 1 FROM xb.park_profiles AS profile WHERE profile."person_id" = person."id")
       AND NOT EXISTS (SELECT 1 FROM xb.accounts AS account WHERE account."person_id" = person."id")
       AND NOT EXISTS (SELECT 1 FROM xb.person_licenses AS license WHERE license."person_id" = person."id")
  `;
};
