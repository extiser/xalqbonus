import { db } from '#server/db';
import type { Prisma } from '#server/generated/prisma/client';
import type { StockMovementKind } from '#server/generated/prisma/enums';

/**
 * Остатки по офисам: журнал движения и его кэш.
 *
 * Отношение ровно то же, что у журнала баллов и `accounts.balance`: истина лежит
 * в `stock_movements`, а `office_stock` — кэш, который правится только вместе с движением,
 * в одной транзакции. Прямой `UPDATE office_stock` запрещён везде, кроме `writeStockMovement`
 * (docs/decisions.md → «Каталог: заказ — это касса, остаток живёт по офисам»).
 *
 * Запись идёт сырым SQL: `ON CONFLICT`, `FOR UPDATE` и инкремент на стороне базы
 * типизированным API Prisma не выражаются, а без них два оформления одного товара
 * затирают друг другу остаток — тот же класс гонки, что губил балансы в старом боте.
 */

export type StockRow = {
  officeId: string;
  productId: string;
  /** Свободный остаток: лежит в офисе и никем не занят. */
  onHand: number;
  /** Занято висящими заказами. */
  reserved: number;
};

/**
 * Берёт строки остатка под блокировку до конца транзакции.
 *
 * **Порядок захвата фиксирован `ORDER BY`** — по `(office_id, product_id)`. Это не
 * косметика: узел блокировки стоит над сортировкой, и порядок захвата равен порядку выдачи
 * строк. Два оформления, взявшие одни и те же товары в разном порядке, встали бы в дедлок
 * и разошлись бы только по таймауту базы.
 *
 * Строки, которой нет, в ответе не будет: товар в этот офис ни разу не приходил, и его
 * свободный остаток — ноль. Вставлять пустую строку «чтобы было что заблокировать» нельзя —
 * это запись в кэш остатка без движения в журнале.
 */
export const lockStockRows = async (
  client: Prisma.TransactionClient,
  officeId: string,
  productIds: string[],
): Promise<StockRow[]> =>
  client.$queryRaw<StockRow[]>`
    SELECT "office_id"  AS "officeId",
           "product_id" AS "productId",
           "on_hand"    AS "onHand",
           "reserved"
      FROM xb.office_stock
     WHERE "office_id" = ${officeId}::uuid
       AND "product_id" = ANY(${productIds}::uuid[])
     ORDER BY "office_id", "product_id"
       FOR UPDATE
  `;

export type StockMovementInput = {
  officeId: string;
  productId: string;
  kind: StockMovementKind;
  /** Изменение свободного остатка. Знак задаётся видом движения, а не вызывающим. */
  deltaOnHand: number;
  /** Изменение резерва. */
  deltaReserved: number;
  orderId?: string | null;
  employeeId?: string | null;
  note?: string | null;
};

/**
 * Пишет движение и правит кэш остатка. Обе записи — одним вызовом, и вызывать его вне
 * транзакции нельзя: кэш, разошедшийся с журналом, ловится `make invariants`, но не чинится.
 *
 * Кэш правится выражением на стороне базы, а не «прочитали, посчитали, записали»:
 * последнее и есть гонка, затиравшая начисления в старом проекте. Строка появляется
 * вставкой при первом же движении по паре — приход в офис, где этого товара ещё не было,
 * штатный случай.
 *
 * Неотрицательность остатка проверяет база (`office_stock_on_hand_check`,
 * `office_stock_reserved_check`), а согласие знаков с видом движения —
 * `stock_movements_kind_signs_check`. Оба отказа переводит в доменную ошибку вызывающий
 * сервис.
 */
export const writeStockMovement = async (
  client: Prisma.TransactionClient,
  input: StockMovementInput,
): Promise<void> => {
  await client.$executeRaw`
    INSERT INTO xb.stock_movements (
      "office_id", "product_id", "kind",
      "delta_on_hand", "delta_reserved",
      "order_id", "employee_id", "note"
    )
    VALUES (
      ${input.officeId}::uuid,
      ${input.productId}::uuid,
      ${input.kind}::xb.stock_movement_kind,
      ${input.deltaOnHand},
      ${input.deltaReserved},
      ${input.orderId ?? null}::uuid,
      ${input.employeeId ?? null}::uuid,
      ${input.note ?? null}
    )
  `;

  // Строка кэша сначала заводится нулевой, и только потом правится дельтой. Одним
  // `INSERT … ON CONFLICT DO UPDATE` это не делается: проверку `office_stock_on_hand_check`
  // база применяет к вставляемой строке-кандидату — до того, как обнаружит конфликт
  // и перейдёт к `DO UPDATE`, — и любая отрицательная дельта отбивалась бы на строке,
  // которая в таблицу и не собиралась.
  await client.$executeRaw`
    INSERT INTO xb.office_stock ("office_id", "product_id")
    VALUES (${input.officeId}::uuid, ${input.productId}::uuid)
    ON CONFLICT ("office_id", "product_id") DO NOTHING
  `;

  const updated = await client.$executeRaw`
    UPDATE xb.office_stock
       SET "on_hand"    = "on_hand"  + ${input.deltaOnHand},
           "reserved"   = "reserved" + ${input.deltaReserved},
           "updated_at" = now()
     WHERE "office_id" = ${input.officeId}::uuid AND "product_id" = ${input.productId}::uuid
  `;

  // Строка только что заведена или уже была: ноль здесь означал бы, что кэш остатка
  // правит кто-то мимо этого пути, и движение в журнале осталось бы без своей половины.
  if (updated !== 1) {
    throw new Error(
      `движение по товару ${input.productId} в офисе ${input.officeId} тронуло ${updated} строк кэша вместо одной`,
    );
  }
};

/** Остаток одной пары. Нужен тем, кто показывает витрину, и проверкам после операции. */
export const findStockRow = async (
  officeId: string,
  productId: string,
  client: Prisma.TransactionClient = db,
): Promise<StockRow | null> => {
  const rows = await client.$queryRaw<StockRow[]>`
    SELECT "office_id"  AS "officeId",
           "product_id" AS "productId",
           "on_hand"    AS "onHand",
           "reserved"
      FROM xb.office_stock
     WHERE "office_id" = ${officeId}::uuid AND "product_id" = ${productId}::uuid
  `;

  return rows[0] ?? null;
};
