import { db } from '#server/db';

/**
 * Заказы истории, порции сбора и уборка таблиц метрик для теста пересчёта (issue #371).
 *
 * Таблицы метрик целиком производные: пересчёт стирает их и пишет заново, поэтому уборка
 * стирает их целиком тоже — иначе строки с людьми тестов держали бы внешний ключ, и уборка
 * людей (`cleanupTestData`) падала бы на нём.
 */

export type TestHistoryOrderInput = {
  orderId: string;
  profileId: string;
  status: string;
  endedAt: Date | null;
};

export const insertTestHistoryOrder = async (input: TestHistoryOrderInput): Promise<void> => {
  await db.fleetOrderHistory.create({
    data: {
      orderId: input.orderId,
      profileId: input.profileId,
      status: input.status,
      category: 'econom',
      paymentMethod: 'cash',
      bookedAt: input.endedAt ?? new Date('2025-11-01T00:00:00Z'),
      endedAt: input.endedAt,
      price: 25000,
    },
  });
};

/** Порция сбора истории `parkDay` (сутки UTC): закрытая или прерванная. */
export const upsertTestHistoryDay = async (parkDay: string, closed: boolean): Promise<void> => {
  const day = new Date(`${parkDay}T00:00:00Z`);
  const finishedAt = closed ? new Date() : null;

  await db.fleetOrderHistoryDay.upsert({
    where: { parkDay: day },
    create: {
      parkDay: day,
      orders: 0,
      complete: 0,
      malformed: 0,
      pages: 1,
      rateLimited: 0,
      startedAt: new Date(),
      finishedAt,
    },
    update: { finishedAt },
  });
};

export type TestPersonDay = { day: string; personId: string; trips: number };

/** Строки таблицы метрик этих людей, по порядку суток. */
export const readTestPersonDays = async (personIds: readonly string[]): Promise<TestPersonDay[]> =>
  db.$queryRaw<TestPersonDay[]>`
    SELECT to_char("day", 'YYYY-MM-DD') AS "day", "person_id" AS "personId", "trips"
      FROM xb.metric_person_days
     WHERE "person_id" = ANY(${[...personIds]}::uuid[])
     ORDER BY "day", "person_id"
  `;

/**
 * Строки таблицы метрик напрямую, мимо пересчёта, — фикстура потока водителей (issue #392):
 * поток читает только таблицу, и строить её из поездок незачем.
 */
export const insertTestPersonDays = async (rows: readonly TestPersonDay[]): Promise<void> => {
  await db.metricPersonDay.createMany({
    data: rows.map((row) => ({ day: new Date(`${row.day}T00:00:00Z`), personId: row.personId, trips: row.trips })),
  });
};

export const countMetricPersonDays = async (): Promise<number> => {
  const rows = await db.$queryRaw<{ total: number }[]>`
    SELECT count(*)::int AS "total" FROM xb.metric_person_days
  `;

  return rows[0]?.total ?? 0;
};

export const cleanupTestMetrics = async (
  historyOrderIds: readonly string[],
  historyDays: readonly string[],
): Promise<void> => {
  await db.$executeRaw`DELETE FROM xb.metric_person_days`;
  await db.$executeRaw`DELETE FROM xb.metric_recompute_runs`;
  await db.$executeRaw`
    DELETE FROM xb.fleet_order_history WHERE "order_id" = ANY(${[...historyOrderIds]}::text[])
  `;
  await db.$executeRaw`
    DELETE FROM xb.fleet_order_history_days WHERE "park_day" = ANY(${[...historyDays]}::date[])
  `;
};

/**
 * Привязки Telegram, телефоны и карточки профилей для тестов вкладки «Глубина» (issue #373).
 * Привязки убираются своей уборкой — до `cleanupTestData`: они ссылаются на человека.
 */
const createdLinkIds = new Set<string>();

/** Отдельный диапазон чатов: активный чат уникален, а чаты других тестов — мелкие числа. */
let nextChatId = 7_373_000_000n;

export const linkTestPersonAt = async (
  personId: string,
  linkedAt: Date,
  closedAt: Date | null = null,
): Promise<void> => {
  nextChatId += 1n;

  const link = await db.telegramLink.create({
    data: {
      personId,
      telegramChatId: nextChatId,
      linkedAt,
      closedAt,
      closeReason: closedAt === null ? null : 'operator',
      confirmedBy: 'phone_auto',
    },
  });

  createdLinkIds.add(link.id);
};

export const cleanupTestLinks = async (): Promise<void> => {
  const linkIds = [...createdLinkIds];
  createdLinkIds.clear();

  await db.$executeRaw`DELETE FROM xb.telegram_links WHERE "id" = ANY(${linkIds}::uuid[])`;
};

export type TestProfilePhoneInput = {
  phoneRaw: string;
  phoneE164: string | null;
  closedAt?: Date | null;
};

/** Телефон профиля. Убирается `cleanupTestData` вместе с профилем. */
export const addTestProfilePhone = async (profileId: string, input: TestProfilePhoneInput): Promise<void> => {
  await db.profilePhone.create({
    data: {
      profileId,
      phoneRaw: input.phoneRaw,
      phoneE164: input.phoneE164,
      closedAt: input.closedAt ?? null,
    },
  });
};

/** Позывной и имя профиля — чтобы различить профили одного человека в выгрузке. */
export const setTestProfileCard = async (
  profileId: string,
  card: { callsign: string; firstName: string; lastName: string },
): Promise<void> => {
  await db.parkProfile.update({ where: { profileId }, data: card });
};

/**
 * Переносит выдачу заказа в прошлое. Заказ у стойки выдаётся «сейчас», а цена балла считается
 * на конец месяца: так заказ ложится в месяц теста, где чужих заказов нет.
 */
export const backdateTestOrderIssue = async (orderId: string, issuedAt: Date): Promise<void> => {
  await db.$executeRaw`
    UPDATE xb.orders SET "issued_at" = ${issuedAt} WHERE "id" = ${orderId}::uuid
  `;
};
