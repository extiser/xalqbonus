import { db } from '#server/db';

/**
 * Фикстуры и уборка для тестов ядра баллов.
 *
 * Тесты ходят в настоящую базу, а не в заглушку: проверяются ровно те вещи, которых
 * в заглушке нет — уникальное ограничение на ключ идемпотентности, `CHECK` на минусовой
 * баланс, блокировки и инкремент на стороне базы. Заглушка подтвердила бы работу кода,
 * а не работу ядра.
 *
 * Уборка идёт по людям, заведённым тестом, а не `TRUNCATE` по таблицам: локальная база
 * общая с разведкой и с будущей синхронизацией, и снос всего журнала ради одного теста —
 * это потеря данных, которые никто не просил удалять.
 */

if (process.env.NODE_ENV === 'production') {
  throw new Error('тесты ядра баллов не запускаются против боевого окружения');
}

/** Люди, заведённые этим файлом тестов. Уборка идёт по ним и только по ним. */
const createdPersonIds = new Set<string>();

export type TestPerson = {
  personId: string;
  profileId: string;
};

/**
 * Заводит человека с профилем в парке. `inProgram` управляет наличием `person_settings` —
 * это и есть граница «известен парку / участвует в программе» (docs/drivers.md).
 */
export const createTestPerson = async ({ inProgram }: { inProgram: boolean }): Promise<TestPerson> => {
  const person = await db.person.create({ data: {} });
  createdPersonIds.add(person.id);

  const profileId = `test-profile-${person.id}`;
  const now = new Date();

  await db.parkProfile.create({
    data: {
      profileId,
      personId: person.id,
      parkId: 'test-park',
      firstName: 'Тест',
      lastName: 'Тестов',
      workStatus: 'working',
      employmentType: 'self_employed',
      isSelfemployed: true,
      workRuleId: 'test-work-rule',
      currentStatus: 'offline',
      apiCreatedAt: now,
      apiModifiedAt: now,
      apiUpdatedAt: now,
      lastSyncedAt: now,
    },
  });

  if (inProgram) {
    await db.personSettings.create({
      data: { personId: person.id, language: 'ru', joinedSource: 'test' },
    });
  }

  return { personId: person.id, profileId };
};

export type CreateTestTripInput = {
  profileId: string;
  tripOrderId: string;
  status: string;
  endedAt: Date | null;
};

export const createTestTrip = async (input: CreateTestTripInput): Promise<void> => {
  const bookedAt = new Date('2026-08-01T10:00:00.000Z');

  await db.trip.create({
    data: {
      orderId: input.tripOrderId,
      profileId: input.profileId,
      status: input.status,
      category: 'econom',
      paymentMethod: 'cash',
      provider: 'platform',
      bookedAt,
      apiCreatedAt: bookedAt,
      endedAt: input.endedAt,
      price: 25000,
      carId: 'test-car',
      carLicenseNumber: '01A123AA',
      carBrandModel: 'Chevrolet Cobalt',
      addressFromText: 'Ташкент, тестовый адрес',
      addressFromLat: 41.3,
      addressFromLon: 69.24,
      flags: [],
      amenities: [],
    },
  });
};

/** Переводит поездку в другой статус — так же, как это сделает синхронизация. */
export const setTripStatus = async (
  tripOrderId: string,
  status: string,
  endedAt: Date | null,
): Promise<void> => {
  await db.trip.update({ where: { orderId: tripOrderId }, data: { status, endedAt } });
};

export const readAccountBalance = async (personId: string): Promise<bigint> => {
  const rows = await db.$queryRaw<{ balance: bigint }[]>`
    SELECT "balance" FROM xb.accounts WHERE "type" = 'driver' AND "person_id" = ${personId}::uuid
  `;

  return rows[0]?.balance ?? 0n;
};

export const readSystemBalance = async (type: string): Promise<bigint> => {
  const rows = await db.$queryRaw<{ balance: bigint }[]>`
    SELECT "balance" FROM xb.accounts WHERE "type" = ${type}::xb.account_type
  `;

  return rows[0]?.balance ?? 0n;
};

export const countTransfersByKey = async (idempotencyKey: string): Promise<number> => {
  const rows = await db.$queryRaw<{ total: bigint }[]>`
    SELECT COUNT(*) AS total FROM xb.point_transfers WHERE "idempotency_key" = ${idempotencyKey}
  `;

  return Number(rows[0]?.total ?? 0n);
};

/**
 * Убирает за тестом: людей, их профили, поездки, счета и связанные переводы.
 *
 * Системные счета не удаляются — они заведены миграцией. Их кэш баланса пересчитывается
 * от журнала: удалённые записи ушли из журнала, и без пересчёта второй инвариант
 * («сумма записей по счёту равна кэшу») справедливо расходился бы после уборки.
 */
export const cleanupTestData = async (): Promise<void> => {
  const personIds = [...createdPersonIds];
  createdPersonIds.clear();

  if (personIds.length === 0) {
    return;
  }

  await db.$transaction(async (transaction) => {
    await transaction.$executeRaw`
      DELETE FROM xb.point_entries
       WHERE "transfer_id" IN (
             SELECT "id" FROM xb.point_transfers
              WHERE "from_account_id" IN (SELECT "id" FROM xb.accounts WHERE "person_id" = ANY(${personIds}::uuid[]))
                 OR "to_account_id"   IN (SELECT "id" FROM xb.accounts WHERE "person_id" = ANY(${personIds}::uuid[]))
       )
    `;
    await transaction.$executeRaw`
      DELETE FROM xb.point_transfers
       WHERE "from_account_id" IN (SELECT "id" FROM xb.accounts WHERE "person_id" = ANY(${personIds}::uuid[]))
          OR "to_account_id"   IN (SELECT "id" FROM xb.accounts WHERE "person_id" = ANY(${personIds}::uuid[]))
    `;
    await transaction.$executeRaw`
      DELETE FROM xb.accounts WHERE "person_id" = ANY(${personIds}::uuid[])
    `;
    await transaction.$executeRaw`
      DELETE FROM xb.trips
       WHERE "profile_id" IN (SELECT "profile_id" FROM xb.park_profiles WHERE "person_id" = ANY(${personIds}::uuid[]))
    `;
    await transaction.$executeRaw`
      DELETE FROM xb.park_profiles WHERE "person_id" = ANY(${personIds}::uuid[])
    `;
    await transaction.$executeRaw`
      DELETE FROM xb.person_settings WHERE "person_id" = ANY(${personIds}::uuid[])
    `;
    await transaction.$executeRaw`
      DELETE FROM xb.persons WHERE "id" = ANY(${personIds}::uuid[])
    `;
    await transaction.$executeRaw`
      UPDATE xb.accounts AS account
         SET "balance" = COALESCE(
               (SELECT SUM(entry.delta) FROM xb.point_entries AS entry WHERE entry.account_id = account.id),
               0
             ),
             "updated_at" = now()
       WHERE account."type" <> 'driver'
    `;
  });
};

/**
 * Гоняет произвольный запрос — им тест инвариантов исполняет запросы, взятые
 * из scripts/invariants.sql, вместо того чтобы держать их вторую копию.
 */
export const runRawQuery = <Row>(sql: string): Promise<Row[]> => db.$queryRawUnsafe<Row[]>(sql);

/**
 * Ломает кэш баланса счёта мимо журнала — ровно то, что делает старый бот и что обязан
 * поймать второй инвариант. Нужна, чтобы проверка инвариантов не была проверкой,
 * которая не умеет падать.
 *
 * Это единственное место во всём репозитории, кроме уборки выше, где `accounts.balance`
 * меняется не сервисом журнала, и оба — фикстуры тестов, а не рабочий код.
 */
export const breakBalanceCacheForTest = async (personId: string, delta: number): Promise<void> => {
  await db.$executeRawUnsafe(
    'UPDATE xb.accounts SET "balance" = "balance" + $2 WHERE "type" = \'driver\' AND "person_id" = $1::uuid',
    personId,
    delta,
  );
};

export const disconnectDatabase = (): Promise<void> => db.$disconnect();
