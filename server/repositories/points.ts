import { db } from '#server/db';
import type { Prisma } from '#server/generated/prisma/client';
import type { AccountType, PointReason } from '#server/generated/prisma/enums';

/**
 * Доступ к счетам и журналу баллов. Единственный слой, которому разрешено знать Prisma
 * (docs/principles.md → «Слои и зависимости»).
 *
 * Запись перевода идёт сырым SQL: `ON CONFLICT`, `FOR UPDATE` и инкремент на стороне базы
 * типизированным API Prisma не выражаются, а без них идемпотентность превращается
 * в проверку «уже сделано?», которая ломается при параллельном запуске.
 *
 * Схема в сыром SQL указывается явно — `xb.accounts`, а не `accounts`. `?schema=xb`
 * в строке подключения понимает Prisma, а не `pg`: у соединения драйверного адаптера
 * `search_path` остаётся дефолтным, и запрос без префикса молча ушёл бы в `public`
 * (docs/decisions.md → «В сыром SQL схема указывается явно»).
 */

export type AccountRow = {
  id: string;
  type: AccountType;
  personId: string | null;
  balance: bigint;
};

export type TransferRow = {
  id: string;
  reason: PointReason;
  idempotencyKey: string;
  amount: bigint;
  fromAccountId: string;
  toAccountId: string;
  occurredAt: Date;
};

/** Контекст операции — явными полями, а не jsonb: разнородная колонка не проверяется ничем. */
export type TransferContext = {
  tripOrderId?: string | null;
  legacyOrderId?: number | null;
  actor?: string | null;
  note?: string | null;
};

export type WriteTransferInput = {
  reason: PointReason;
  idempotencyKey: string;
  amount: bigint;
  fromAccountId: string;
  toAccountId: string;
  occurredAt: Date;
  context: TransferContext;
};

export type WriteTransferResult = {
  transfer: TransferRow;
  /** `false` — перевод по этому ключу был записан раньше, ни один баланс не тронут. */
  applied: boolean;
};

// Суммы уходят в базу текстом с явным приведением к bigint: сериализация BigInt зависит
// от драйвера, а текст с `::bigint` читается одинаково везде и не теряет разрядов.
const asBigintLiteral = (value: bigint): string => value.toString();

export const findSystemAccount = async (type: AccountType): Promise<AccountRow | null> => {
  const rows = await db.$queryRaw<AccountRow[]>`
    SELECT "id", "type", "person_id" AS "personId", "balance"
      FROM xb.accounts
     WHERE "type" = ${type}::xb.account_type
  `;

  return rows[0] ?? null;
};

export const findDriverAccountByPerson = async (personId: string): Promise<AccountRow | null> => {
  const rows = await db.$queryRaw<AccountRow[]>`
    SELECT "id", "type", "person_id" AS "personId", "balance"
      FROM xb.accounts
     WHERE "type" = 'driver' AND "person_id" = ${personId}::uuid
  `;

  return rows[0] ?? null;
};

/**
 * Заводит водительский счёт, если его ещё нет, и возвращает его в любом случае.
 *
 * Вставка с обработкой конфликта, а не «посмотрели и завели»: между чтением и вставкой
 * успевает вклиниться второй воркер. Конфликт разрешается по частичному уникальному
 * индексу `accounts_driver_person_key`, поэтому условие индекса повторено в `ON CONFLICT`.
 */
export const insertDriverAccount = async (personId: string): Promise<AccountRow> => {
  const inserted = await db.$queryRaw<AccountRow[]>`
    INSERT INTO xb.accounts ("type", "person_id")
    VALUES ('driver', ${personId}::uuid)
    ON CONFLICT ("person_id") WHERE "type" = 'driver' DO NOTHING
    RETURNING "id", "type", "person_id" AS "personId", "balance"
  `;

  if (inserted[0]) {
    return inserted[0];
  }

  const existing = await findDriverAccountByPerson(personId);

  // Конфликт был, значит строка есть. Пусто здесь означало бы, что счёт удалили
  // между двумя запросами, — такого сценария в программе нет.
  if (!existing) {
    throw new Error(`водительский счёт человека ${personId} исчез между вставкой и чтением`);
  }

  return existing;
};

// Клиент передаётся параметром: внутри транзакции читать глобальным клиентом нельзя —
// это другое соединение, и собственных, ещё не зафиксированных строк оно не видит.
const selectTransferByIdempotencyKey = async (
  client: Prisma.TransactionClient,
  idempotencyKey: string,
): Promise<TransferRow | null> => {
  const rows = await client.$queryRaw<TransferRow[]>`
    SELECT "id",
           "reason",
           "idempotency_key"  AS "idempotencyKey",
           "amount",
           "from_account_id"  AS "fromAccountId",
           "to_account_id"    AS "toAccountId",
           "occurred_at"      AS "occurredAt"
      FROM xb.point_transfers
     WHERE "idempotency_key" = ${idempotencyKey}
  `;

  return rows[0] ?? null;
};

/**
 * Записывает перевод целиком: строка `point_transfers`, две строки `point_entries`
 * и два обновления кэша баланса — в одной транзакции. Половины перевода не бывает.
 */
export const writeTransfer = async (input: WriteTransferInput): Promise<WriteTransferResult> => {
  const amountLiteral = asBigintLiteral(input.amount);

  return db.$transaction(async (transaction) => {
    // Счета блокируются по возрастанию идентификатора, независимо от того, кто из них
    // источник: два встречных перевода между одной парой счетов иначе встают в дедлок.
    // `ORDER BY` здесь не косметика — узел блокировки стоит над сортировкой, и порядок
    // захвата равен порядку выдачи строк.
    await transaction.$queryRaw`
      SELECT "id"
        FROM xb.accounts
       WHERE "id" IN (${input.fromAccountId}::uuid, ${input.toAccountId}::uuid)
       ORDER BY "id"
         FOR UPDATE
    `;

    // Идемпотентность держится уникальным ограничением, а не проверкой «уже есть такой
    // ключ?»: между проверкой и вставкой помещается второй воркер (docs/points.md).
    const inserted = await transaction.$queryRaw<TransferRow[]>`
      INSERT INTO xb.point_transfers (
        "reason", "idempotency_key", "amount",
        "from_account_id", "to_account_id", "occurred_at",
        "trip_order_id", "legacy_order_id", "actor", "note"
      )
      VALUES (
        ${input.reason}::xb.point_reason,
        ${input.idempotencyKey},
        ${amountLiteral}::bigint,
        ${input.fromAccountId}::uuid,
        ${input.toAccountId}::uuid,
        ${input.occurredAt},
        ${input.context.tripOrderId ?? null},
        ${input.context.legacyOrderId ?? null},
        ${input.context.actor ?? null},
        ${input.context.note ?? null}
      )
      ON CONFLICT ("idempotency_key") DO NOTHING
      RETURNING "id",
                "reason",
                "idempotency_key"  AS "idempotencyKey",
                "amount",
                "from_account_id"  AS "fromAccountId",
                "to_account_id"    AS "toAccountId",
                "occurred_at"      AS "occurredAt"
    `;

    const transfer = inserted[0];

    if (!transfer) {
      const existing = await selectTransferByIdempotencyKey(transaction, input.idempotencyKey);

      if (!existing) {
        throw new Error(
          `перевод по ключу ${input.idempotencyKey} не вставился и не читается — журнал в противоречии`,
        );
      }

      return { transfer: existing, applied: false };
    }

    await transaction.$executeRaw`
      INSERT INTO xb.point_entries ("transfer_id", "account_id", "delta")
      VALUES (${transfer.id}::uuid, ${input.fromAccountId}::uuid, -${amountLiteral}::bigint),
             (${transfer.id}::uuid, ${input.toAccountId}::uuid,    ${amountLiteral}::bigint)
    `;

    // Баланс меняется выражением на стороне базы. «Прочитали в приложении, посчитали,
    // записали» — это и есть гонка, которая затирала начисления в старом проекте
    // (docs/analysis.md). Оба счёта правятся одним запросом: они уже заблокированы выше.
    const updated = await transaction.$executeRaw`
      UPDATE xb.accounts
         SET "balance" = "balance" + CASE
               WHEN "id" = ${input.toAccountId}::uuid THEN ${amountLiteral}::bigint
               ELSE -${amountLiteral}::bigint
             END,
             "updated_at" = now()
       WHERE "id" IN (${input.fromAccountId}::uuid, ${input.toAccountId}::uuid)
    `;

    if (updated !== 2) {
      throw new Error(
        `перевод ${transfer.id} тронул ${updated} счёт(ов) вместо двух — журнал в противоречии`,
      );
    }

    return { transfer, applied: true };
  });
};

export type BalanceTotals = {
  driverAccounts: number;
  driverAccountsPositive: number;
  driverBalanceTotal: bigint;
  emissionBalance: bigint;
};

/**
 * Итоги по счетам для отчёта переноса. Считаются по кэшу баланса, а сходимость кэша
 * с журналом проверяет `make invariants` — вторым запросом из scripts/invariants.sql.
 */
export const readBalanceTotals = async (): Promise<BalanceTotals> => {
  const rows = await db.$queryRaw<
    {
      driverAccounts: bigint;
      driverAccountsPositive: bigint;
      driverBalanceTotal: bigint;
      emissionBalance: bigint;
    }[]
  >`
    SELECT COUNT(*) FILTER (WHERE "type" = 'driver')                     AS "driverAccounts",
           COUNT(*) FILTER (WHERE "type" = 'driver' AND "balance" > 0)   AS "driverAccountsPositive",
           COALESCE(SUM("balance") FILTER (WHERE "type" = 'driver'), 0)  AS "driverBalanceTotal",
           COALESCE(SUM("balance") FILTER (WHERE "type" = 'emission'), 0) AS "emissionBalance"
      FROM xb.accounts
  `;

  const row = rows[0];

  return {
    driverAccounts: Number(row?.driverAccounts ?? 0n),
    driverAccountsPositive: Number(row?.driverAccountsPositive ?? 0n),
    driverBalanceTotal: row?.driverBalanceTotal ?? 0n,
    emissionBalance: row?.emissionBalance ?? 0n,
  };
};

export type AccountReconciliationRow = {
  accountId: string;
  cachedBalance: bigint;
  journalBalance: bigint;
  entriesCount: number;
  firstEntryAt: Date | null;
  lastEntryAt: Date | null;
};

/**
 * Счёт водителя вместе со сверкой: кэш баланса и сумма журнала по этому счёту, одним
 * запросом.
 *
 * Два числа считаются рядом намеренно. Баланс — производная от журнала, а `accounts.balance`
 * всего лишь кэш, обновляемый вместе с записью в журнал в одной транзакции; расхождение
 * означает, что кто-то правит баланс мимо сервиса. Это второй запрос из
 * `scripts/invariants.sql`, суженный до одного счёта, — экран обязан показывать ровно то же,
 * что показывает `make invariants`.
 *
 * `sum` по `bigint` возвращает `numeric`, поэтому результат приведён обратно к `bigint`:
 * без приведения драйвер отдал бы строку там, где ожидается число.
 */
export const findDriverAccountReconciliation = async (
  personId: string,
): Promise<AccountReconciliationRow | null> => {
  const rows = await db.$queryRaw<AccountReconciliationRow[]>`
    SELECT account."id"      AS "accountId",
           account."balance" AS "cachedBalance",
           journal."journalBalance",
           journal."entriesCount",
           journal."firstEntryAt",
           journal."lastEntryAt"
      FROM xb.accounts AS account
      LEFT JOIN LATERAL (
        SELECT coalesce(sum(entry."delta"), 0)::bigint AS "journalBalance",
               count(*)::int                           AS "entriesCount",
               min(transfer."occurred_at")             AS "firstEntryAt",
               max(transfer."occurred_at")             AS "lastEntryAt"
          FROM xb.point_entries AS entry
          JOIN xb.point_transfers AS transfer ON transfer."id" = entry."transfer_id"
         WHERE entry."account_id" = account."id"
      ) AS journal ON TRUE
     WHERE account."type" = 'driver' AND account."person_id" = ${personId}::uuid
  `;

  return rows[0] ?? null;
};

export type AccountOperationRow = {
  transferId: string;
  reason: PointReason;
  idempotencyKey: string;
  amount: bigint;
  occurredAt: Date;
  createdAt: Date;
  delta: bigint;
  counterpartyAccountId: string;
  counterpartyType: AccountType;
  counterpartyPersonId: string | null;
  counterpartyName: string | null;
  counterpartyDelta: bigint | null;
  tripOrderId: string | null;
  tripStatus: string | null;
  tripEndedAt: Date | null;
  tripPrice: string | null;
  legacyOrderId: number | null;
  actor: string | null;
  note: string | null;
};

/**
 * Операции по счёту, страницей, новыми вперёд.
 *
 * Считается от записей журнала, а не от переводов: на счёт приходится ровно одна запись
 * перевода, и листание по `(account_id, id)` идёт по индексу.
 *
 * Вторая сторона берётся из самого перевода — из пары `from`/`to`, — а её запись журнала
 * подтягивается отдельным `LEFT JOIN`. Разница не косметическая: перевод без второй записи
 * нарушает первый инвариант, и внешнее соединение показывает такую операцию с пустой
 * половиной, а внутреннее спрятало бы её целиком. Экран наблюдаемости, скрывающий битую
 * запись, бесполезен ровно там, где нужен.
 */
export const listAccountOperations = async (
  accountId: string,
  limit: number,
  offset: number,
): Promise<AccountOperationRow[]> =>
  db.$queryRaw<AccountOperationRow[]>`
    SELECT transfer."id"              AS "transferId",
           transfer."reason",
           transfer."idempotency_key" AS "idempotencyKey",
           transfer."amount",
           transfer."occurred_at"     AS "occurredAt",
           transfer."created_at"      AS "createdAt",
           entry."delta",
           counterparty."id"          AS "counterpartyAccountId",
           counterparty."type"        AS "counterpartyType",
           counterparty."person_id"   AS "counterpartyPersonId",
           counterparty_name."name"   AS "counterpartyName",
           counterparty_entry."delta" AS "counterpartyDelta",
           transfer."trip_order_id"   AS "tripOrderId",
           trip."status"              AS "tripStatus",
           trip."ended_at"            AS "tripEndedAt",
           trip."price"::text         AS "tripPrice",
           transfer."legacy_order_id" AS "legacyOrderId",
           transfer."actor",
           transfer."note"
      FROM xb.point_entries AS entry
      JOIN xb.point_transfers AS transfer ON transfer."id" = entry."transfer_id"
      JOIN xb.accounts AS counterparty
        ON counterparty."id" = CASE
             WHEN transfer."from_account_id" = entry."account_id" THEN transfer."to_account_id"
             ELSE transfer."from_account_id"
           END
      LEFT JOIN xb.point_entries AS counterparty_entry
             ON counterparty_entry."transfer_id" = transfer."id"
            AND counterparty_entry."account_id" = counterparty."id"
      LEFT JOIN LATERAL (
        SELECT concat_ws(' ', profile."last_name", profile."first_name", profile."middle_name")
                 AS "name"
          FROM xb.park_profiles AS profile
         WHERE profile."person_id" = counterparty."person_id"
         ORDER BY (profile."work_status" = 'working') DESC, profile."api_updated_at" DESC
         LIMIT 1
      ) AS counterparty_name ON TRUE
      LEFT JOIN xb.trips AS trip ON trip."order_id" = transfer."trip_order_id"
     WHERE entry."account_id" = ${accountId}::uuid
     ORDER BY entry."id" DESC
     LIMIT ${limit} OFFSET ${offset}
  `;

export const countAccountOperations = async (accountId: string): Promise<number> => {
  const rows = await db.$queryRaw<{ total: number }[]>`
    SELECT count(*)::int AS "total"
      FROM xb.point_entries
     WHERE "account_id" = ${accountId}::uuid
  `;

  return rows[0]?.total ?? 0;
};
