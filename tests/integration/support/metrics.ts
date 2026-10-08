import { db } from '#server/db';

/**
 * Заказы истории, порции сбора и уборка таблиц метрик для теста пересчёта (issue #371);
 * транзакции с суммами и порции сбора транзакций — для пересчёта денег (issue #438).
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

/**
 * Закрытые порции сбора истории за сутки `from`–`to` включительно (сутки UTC) — новичкам
 * (issue #407) нужна вся история с первых суток метрик. Уже заведённые не трогаются. Возвращает
 * сутки — для `cleanupTestMetrics`.
 */
export const closeTestHistoryDays = async (from: string, to: string): Promise<string[]> => {
  const days: string[] = [];

  for (let day = new Date(`${from}T00:00:00Z`); day <= new Date(`${to}T00:00:00Z`); day.setUTCDate(day.getUTCDate() + 1)) {
    days.push(day.toISOString().slice(0, 10));
  }

  const now = new Date();

  await db.fleetOrderHistoryDay.createMany({
    data: days.map((parkDay) => ({
      parkDay: new Date(`${parkDay}T00:00:00Z`),
      orders: 0,
      complete: 0,
      malformed: 0,
      pages: 1,
      rateLimited: 0,
      startedAt: now,
      finishedAt: now,
    })),
    skipDuplicates: true,
  });

  return days;
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

export type TestPersonPrior = { personId: string; lastDay: string };

/**
 * Поездки до истории заказов напрямую, мимо пересчёта, — фикстура потока и новичков (issue #429):
 * они читают только таблицу, как и `metric_person_days`.
 */
export const insertTestPersonPrior = async (rows: readonly TestPersonPrior[]): Promise<void> => {
  await db.metricPersonPrior.createMany({
    data: rows.map((row) => ({ personId: row.personId, lastDay: new Date(`${row.lastDay}T00:00:00Z`) })),
  });
};

/** Строки поездок до истории заказов этих людей, по порядку человека. */
export const readTestPersonPrior = async (personIds: readonly string[]): Promise<TestPersonPrior[]> =>
  db.$queryRaw<TestPersonPrior[]>`
    SELECT "person_id" AS "personId", to_char("last_day", 'YYYY-MM-DD') AS "lastDay"
      FROM xb.metric_person_prior
     WHERE "person_id" = ANY(${[...personIds]}::uuid[])
     ORDER BY "person_id"
  `;

/** Транзакции парка тестов пересчёта: убираются `cleanupTestMetrics` по идентификатору. */
const createdTransactionIds = new Set<string>();

let nextTransactionNumber = 0;

/** Транзакция парка категории `categoryId` у профиля в момент `eventAt`. */
export const insertTestTransaction = async (
  profileId: string | null,
  categoryId: string,
  eventAt: Date,
): Promise<void> => {
  nextTransactionNumber += 1;
  const id = `test-metrics-transaction-${process.pid}-${nextTransactionNumber}`;

  await db.fleetTransaction.create({
    data: { id, eventAt, categoryId, amount: -1374, currencyCode: 'UZS', driverProfileId: profileId },
  });
  createdTransactionIds.add(id);
};

/**
 * Транзакция с суммой — фикстура пересчёта денег (issue #438): доход и оплата складываются
 * из сумм, и знак у них свой у каждой категории. Без профиля: деньги парка — не люди.
 */
export const insertTestMoneyTransaction = async (categoryId: string, eventAt: Date, amount: string): Promise<void> => {
  nextTransactionNumber += 1;
  const id = `test-metrics-transaction-${process.pid}-${nextTransactionNumber}`;

  await db.fleetTransaction.create({
    data: { id, eventAt, categoryId, amount, currencyCode: 'UZS', driverProfileId: null },
  });
  createdTransactionIds.add(id);
};

export type TestMoneyDay = { day: string; orders: number; income: string; payment: string };

/** Строки таблицы денег за сутки `from`–`to`; суммы — строкой, как их хранит `numeric`. */
export const readTestMoneyDays = async (from: string, to: string): Promise<TestMoneyDay[]> =>
  db.$queryRaw<TestMoneyDay[]>`
    SELECT to_char("day", 'YYYY-MM-DD') AS "day", "orders", "income"::text AS "income", "payment"::text AS "payment"
      FROM xb.metric_money_days
     WHERE "day" BETWEEN ${from}::date AND ${to}::date
     ORDER BY "day"
  `;

/** Порция сбора истории транзакций `parkDay` (сутки UTC): закрытая, прерванная или с курсором. */
export const upsertTestTransactionDay = async (
  parkDay: string,
  state: 'closed' | 'unfinished' | 'cursor',
): Promise<void> => {
  const day = new Date(`${parkDay}T00:00:00Z`);
  const finishedAt = state === 'unfinished' ? null : new Date();
  const nextCursor = state === 'cursor' ? 'test-cursor' : null;

  await db.fleetTransactionDay.upsert({
    where: { parkDay: day },
    create: { parkDay: day, transactions: 0, malformed: 0, pages: 1, rateLimited: 0, startedAt: new Date(), finishedAt, nextCursor },
    update: { finishedAt, nextCursor },
  });
};

/** Таблица денег и её журнал — производные целиком, как таблицы поездок; порции сбора — по суткам. */
export const cleanupTestMoney = async (transactionDays: readonly string[]): Promise<void> => {
  const transactionIds = [...createdTransactionIds];
  createdTransactionIds.clear();

  await db.$executeRaw`DELETE FROM xb.metric_money_days`;
  await db.$executeRaw`DELETE FROM xb.metric_money_runs`;
  await db.$executeRaw`DELETE FROM xb.fleet_transactions WHERE "id" = ANY(${transactionIds}::text[])`;
  await db.$executeRaw`
    DELETE FROM xb.fleet_transaction_days WHERE "park_day" = ANY(${[...transactionDays]}::date[])
  `;
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
  const transactionIds = [...createdTransactionIds];
  createdTransactionIds.clear();

  await db.$executeRaw`DELETE FROM xb.metric_person_days`;
  await db.$executeRaw`DELETE FROM xb.metric_person_prior`;
  await db.$executeRaw`DELETE FROM xb.metric_recompute_runs`;
  await db.$executeRaw`DELETE FROM xb.fleet_transactions WHERE "id" = ANY(${transactionIds}::text[])`;
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

/** Позывной и имя профиля — чтобы различить профили одного человека в выгрузке; отчество — у лидеров (issue #402). */
export const setTestProfileCard = async (
  profileId: string,
  card: { callsign: string; firstName: string; lastName: string; middleName?: string },
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
