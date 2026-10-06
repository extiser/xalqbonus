import { db } from '#server/db';
import type { Prisma } from '#server/generated/prisma/client';

/**
 * Транзакции парка, их журнал суток и справочник категорий (issue #358).
 *
 * Про Fleet репозиторий не знает — принимает собственные структуры.
 */

/** Сколько строк уходит в базу одним запросом: страница выборки — до 1000 транзакций. */
const CHUNK_SIZE = 1_000;

export type FleetTransactionInput = {
  id: string;
  eventAt: Date;
  categoryId: string;
  /** Строкой, как отдал API: разбор числа с фиксированной точкой во float теряет копейки. */
  amount: string;
  currencyCode: string | null;
  driverProfileId: string | null;
  orderId: string | null;
  externalEventId: string | null;
  description: string | null;
  createdBy: string | null;
  createdByDispatcher: string | null;
};

/**
 * Кладёт транзакции: новая вставляется, известная обновляется по `id` — повтор окна
 * или суток не плодит строк. Схема указана явно: у сырого соединения `search_path`
 * дефолтный (docs/decisions.md → «В сыром SQL схема указывается явно»).
 */
export const upsertFleetTransactions = async (
  transactions: readonly FleetTransactionInput[],
  client: Prisma.TransactionClient = db,
): Promise<number> => {
  // Повтор `id` внутри одной вставки Postgres отбивает целиком; побеждает последний.
  const unique = [...new Map(transactions.map((transaction) => [transaction.id, transaction])).values()];
  let written = 0;

  for (let offset = 0; offset < unique.length; offset += CHUNK_SIZE) {
    const chunk = unique.slice(offset, offset + CHUNK_SIZE);

    written += await client.$executeRaw`
      INSERT INTO xb.fleet_transactions (
        "id", "event_at", "category_id", "amount", "currency_code", "driver_profile_id",
        "order_id", "external_event_id", "description", "created_by", "created_by_dispatcher"
      )
      SELECT incoming."id",
             incoming."event_at"::timestamptz,
             incoming."category_id",
             incoming."amount"::numeric,
             incoming."currency_code",
             incoming."driver_profile_id",
             incoming."order_id",
             incoming."external_event_id",
             incoming."description",
             incoming."created_by",
             incoming."created_by_dispatcher"
        FROM unnest(
               ${chunk.map((transaction) => transaction.id)}::text[],
               ${chunk.map((transaction) => transaction.eventAt.toISOString())}::text[],
               ${chunk.map((transaction) => transaction.categoryId)}::text[],
               ${chunk.map((transaction) => transaction.amount)}::text[],
               ${chunk.map((transaction) => transaction.currencyCode)}::text[],
               ${chunk.map((transaction) => transaction.driverProfileId)}::text[],
               ${chunk.map((transaction) => transaction.orderId)}::text[],
               ${chunk.map((transaction) => transaction.externalEventId)}::text[],
               ${chunk.map((transaction) => transaction.description)}::text[],
               ${chunk.map((transaction) => transaction.createdBy)}::text[],
               ${chunk.map((transaction) => transaction.createdByDispatcher)}::text[]
             ) AS incoming(
               "id", "event_at", "category_id", "amount", "currency_code", "driver_profile_id",
               "order_id", "external_event_id", "description", "created_by", "created_by_dispatcher"
             )
      ON CONFLICT ("id") DO UPDATE SET
        "event_at"              = EXCLUDED."event_at",
        "category_id"           = EXCLUDED."category_id",
        "amount"                = EXCLUDED."amount",
        "currency_code"         = EXCLUDED."currency_code",
        "driver_profile_id"     = EXCLUDED."driver_profile_id",
        "order_id"              = EXCLUDED."order_id",
        "external_event_id"     = EXCLUDED."external_event_id",
        "description"           = EXCLUDED."description",
        "created_by"            = EXCLUDED."created_by",
        "created_by_dispatcher" = EXCLUDED."created_by_dispatcher",
        "fetched_at"            = now()
    `;
  }

  return written;
};

/** Сколько транзакций лежит с `event_at` в полуинтервале `[from, to)`. */
export const countFleetTransactionsBetween = (from: Date, to: Date): Promise<number> =>
  db.fleetTransaction.count({ where: { eventAt: { gte: from, lt: to } } });

export type FleetTransactionDayInput = {
  /** Сутки сбора: дата в UTC, полночь. */
  parkDay: Date;
  transactions: number;
  malformed: number;
  pages: number;
  rateLimited: number;
  startedAt: Date;
  /** `null` — обход суток прервался. */
  finishedAt: Date | null;
  /** Курсор страницы, следующей за последней записанной; `null` — продолжать не с чего. */
  nextCursor: string | null;
};

export const upsertFleetTransactionDay = async (day: FleetTransactionDayInput): Promise<void> => {
  const { parkDay, ...columns } = day;

  await db.fleetTransactionDay.upsert({
    where: { parkDay },
    create: { parkDay, ...columns },
    update: columns,
  });
};

/**
 * Записывает страницу обхода: её транзакции и итоги суток с курсором следующей страницы —
 * одной транзакцией. Курсор не может оказаться впереди записанных транзакций: при обрыве
 * между двумя отдельными записями страница потерялась бы молча.
 *
 * Итоги ложатся только на незакрытую строку: закрытые сутки, пройденные повтором, получают
 * транзакции, но журнал их не меняется до закрытия. Возвращает число записанных транзакций.
 */
export const saveFleetTransactionPage = (
  transactions: readonly FleetTransactionInput[],
  day: Omit<FleetTransactionDayInput, 'finishedAt'>,
): Promise<number> => {
  const { parkDay, ...columns } = day;

  return db.$transaction(async (transaction) => {
    const written = await upsertFleetTransactions(transactions, transaction);

    await transaction.fleetTransactionDay.updateMany({
      where: { parkDay, finishedAt: null },
      data: columns,
    });

    return written;
  });
};

export type FleetTransactionDayState = {
  transactions: number;
  malformed: number;
  pages: number;
  finishedAt: Date | null;
  nextCursor: string | null;
};

/** Строка журнала суток: итоги, закрытие и курсор продолжения. `null` — строки нет. */
export const readFleetTransactionDay = (parkDay: Date): Promise<FleetTransactionDayState | null> =>
  db.fleetTransactionDay.findUnique({
    where: { parkDay },
    select: { transactions: true, malformed: true, pages: true, finishedAt: true, nextCursor: true },
  });

/** Закрыт ли обход суток: `null` — строки нет, `false` — обход прервался, `true` — пройден. */
export const readFleetTransactionDayClosed = async (parkDay: Date): Promise<boolean | null> => {
  const day = await db.fleetTransactionDay.findUnique({
    where: { parkDay },
    select: { finishedAt: true },
  });

  return day === null ? null : day.finishedAt !== null;
};

/** Заводит строку суток, только если её ещё нет: существующая, в том числе закрытая, не трогается. */
export const createFleetTransactionDayIfAbsent = async (day: FleetTransactionDayInput): Promise<void> => {
  await db.fleetTransactionDay.createMany({ data: [day], skipDuplicates: true });
};

export type FleetTransactionCategoryInput = {
  id: string;
  name: string;
  groupId: string;
  groupName: string;
  isEnabled: boolean;
  isAffectingDriverBalance: boolean;
};

/**
 * Обновляет справочник категорий: известная категория перезаписывается, новая добавляется.
 * Категория, пропавшая из ответа, остаётся: по ней лежат транзакции прошлого.
 */
export const saveFleetTransactionCategories = async (
  categories: readonly FleetTransactionCategoryInput[],
  updatedAt: Date,
): Promise<void> => {
  await db.$transaction(
    categories.map(({ id, ...columns }) =>
      db.fleetTransactionCategory.upsert({
        where: { id },
        create: { id, ...columns, updatedAt },
        update: { ...columns, updatedAt },
      }),
    ),
  );
};

/** Идентификаторы всех категорий справочника. */
export const readFleetTransactionCategoryIds = async (): Promise<Set<string>> => {
  const rows = await db.fleetTransactionCategory.findMany({ select: { id: true } });

  return new Set(rows.map((row) => row.id));
};
