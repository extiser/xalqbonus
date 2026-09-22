import { db } from '#server/db';
import type { Prisma } from '#server/generated/prisma/client';
import type { StockMovementKind } from '#server/generated/prisma/enums';
import type { OfficeRewardEvent } from '#shared/types/catalog';

/**
 * Лента офиса (issue #175): движения остатков и события наград, у которых движения нет.
 *
 * Журнал движений отвечает на вопрос «почему остаток такой», и расширять его нельзя: каждая
 * строка несёт товар и ненулевые дельты проверкой `stock_movements_kind_signs_check`, а строки
 * без товара сломали бы сверку остатка с журналом. Поэтому лента собирается на чтении из двух
 * источников, а не записью в журнал.
 *
 * Второй источник — произвольные награды (`kind = 'custom'`): вручена, выдана, сгорела.
 * Дублирования по построению нет: у награды-товара каждое событие уже описано движением
 * (`reward_reserve`, `reward_issue`, `reward_release`), у баллов нет офиса, а у произвольной
 * движения не бывает — на складе ничего не лежало.
 *
 * Схема в сыром SQL указывается явно (docs/decisions.md → «В сыром SQL схема указывается явно»).
 */

/**
 * Строка ленты — плоская на оба источника: `UNION ALL` требует одних колонок. Движение
 * заполняет `movementId`, вид и товар, событие награды — `rewardEvent` и `rewardId`.
 */
export type OfficeFeedRow = {
  movementId: bigint | null;
  kind: StockMovementKind | null;
  productId: string | null;
  productName: string | null;
  deltaOnHand: number | null;
  deltaReserved: number | null;
  /** Номер заказа для человека. Пуст у прихода, правки и всего, что про награды. */
  orderNumber: number | null;
  rewardEvent: OfficeRewardEvent | null;
  rewardId: string | null;
  /** Название награды — у видов движения награды и у событий наград. */
  rewardTitle: string | null;
  /** Акция — у события вручения награды акции: вручила она, а не сотрудник. */
  campaignTitle: string | null;
  /** Кто сделал. Пусто у движения водителя и у всего, что сделал воркер. */
  employeeName: string | null;
  /** Заметка движения или пояснение к вручению награды. */
  note: string | null;
  createdAt: Date;
};

/**
 * Страница ленты офиса, новыми вперёд.
 *
 * Порядок — по времени, потому что источников два и общего счётчика у них нет. Внутри одного
 * времени движения идут по `id`: два движения одной транзакции получают одно время, и без
 * второго ключа они переставлялись бы между запросами — читающий видел бы то резерв перед
 * списанием, то наоборот. События наград того же мгновения упорядочены наградой и событием —
 * лишь бы порядок не менялся от запроса к запросу.
 *
 * Товар, сотрудник, заказ и награда приезжают именами и номером, а не идентификаторами:
 * ленту читают глазами. Фильтров пока нет, но условие на офис стоит в каждом источнике
 * отдельно — туда же встанут и они.
 */
export const listOfficeFeed = async (
  officeId: string,
  limit: number,
  offset: number,
  client: Prisma.TransactionClient = db,
): Promise<OfficeFeedRow[]> =>
  client.$queryRaw<OfficeFeedRow[]>`
    SELECT movement."id"             AS "movementId",
           movement."kind",
           movement."product_id"     AS "productId",
           product."name"            AS "productName",
           movement."delta_on_hand"  AS "deltaOnHand",
           movement."delta_reserved" AS "deltaReserved",
           "order"."number"          AS "orderNumber",
           NULL::text                AS "rewardEvent",
           reward."id"               AS "rewardId",
           reward."title"            AS "rewardTitle",
           NULL::text                AS "campaignTitle",
           employee."full_name"      AS "employeeName",
           movement."note",
           movement."created_at"     AS "createdAt"
      FROM xb.stock_movements AS movement
      JOIN xb.products  AS product  ON product."id" = movement."product_id"
      LEFT JOIN xb.orders    AS "order"  ON "order"."id" = movement."order_id"
      LEFT JOIN xb.rewards   AS reward   ON reward."id" = movement."reward_id"
      LEFT JOIN xb.employees AS employee ON employee."id" = movement."employee_id"
     WHERE movement."office_id" = ${officeId}::uuid

    UNION ALL

    SELECT NULL::bigint,
           NULL::xb.stock_movement_kind,
           NULL::uuid,
           NULL::text,
           NULL::int,
           NULL::int,
           NULL::int,
           event."name",
           reward."id",
           reward."title",
           CASE WHEN event."name" = 'granted' THEN campaign."title" END,
           employee."full_name",
           CASE WHEN event."name" = 'granted' THEN reward."source_note" END,
           event."at"
      FROM xb.rewards AS reward
     CROSS JOIN LATERAL (
           VALUES ('granted', reward."created_at", reward."granted_by_employee_id"),
                  ('issued',  reward."issued_at",  reward."issued_by_employee_id"),
                  ('expired', reward."expired_at", NULL::uuid)
           ) AS event("name", "at", "employee_id")
      LEFT JOIN xb.campaigns AS campaign ON campaign."id" = reward."campaign_id"
      LEFT JOIN xb.employees AS employee ON employee."id" = event."employee_id"
     WHERE reward."office_id" = ${officeId}::uuid
       AND reward."kind" = 'custom'
       AND event."at" IS NOT NULL

     ORDER BY "createdAt" DESC, "movementId" DESC NULLS LAST, "rewardId", "rewardEvent"
     LIMIT ${limit} OFFSET ${offset}
  `;

/** Сколько всего строк в ленте офиса — листанию нужен предел, а не только страница. */
export const countOfficeFeed = async (
  officeId: string,
  client: Prisma.TransactionClient = db,
): Promise<number> => {
  const rows = await client.$queryRaw<{ total: bigint }[]>`
    SELECT (SELECT count(*)
              FROM xb.stock_movements
             WHERE "office_id" = ${officeId}::uuid)
         + (SELECT count(*) + count("issued_at") + count("expired_at")
              FROM xb.rewards
             WHERE "office_id" = ${officeId}::uuid AND "kind" = 'custom') AS "total"
  `;

  return Number(rows[0]?.total ?? 0);
};
