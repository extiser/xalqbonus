import { countStockMovements, listStockMovements } from '#server/repositories/stock';
import type { StockMovementsResponse } from '#shared/types/catalog';

/**
 * Страница журнала движений офиса, новыми вперёд.
 *
 * Журнал — истина по остатку, а `office_stock` — его кэш, и читают журнал ровно тогда,
 * когда спрашивают «почему остаток такой» (docs/decisions.md → «Каталог: заказ — это касса,
 * остаток живёт по офисам»). Поэтому в строке видно всё, из чего складывается ответ: вид,
 * товар, обе дельты, автор, заметка и заказ.
 *
 * Потолок страницы ставит сервис: сколько строк отдать за раз — его решение, а не клиента,
 * присланная сотня тысяч не должна становиться запросом на сотню тысяч.
 */

export const DEFAULT_MOVEMENTS_LIMIT = 25;
const MAX_MOVEMENTS_LIMIT = 100;

export const readStockMovementsPage = async (
  officeId: string,
  limit: number,
  offset: number,
): Promise<StockMovementsResponse> => {
  const cappedLimit = Math.min(Math.max(limit, 1), MAX_MOVEMENTS_LIMIT);

  const [rows, total] = await Promise.all([
    listStockMovements(officeId, cappedLimit, offset),
    countStockMovements(officeId),
  ]);

  return {
    movements: rows.map((row) => ({
      // Идентификатор уезжает строкой: в базе это bigint, а JSON целых такой ширины не знает,
      // и `JSON.stringify` на `BigInt` падает исключением, а не теряет точность молча.
      movementId: row.id.toString(),
      kind: row.kind,
      productId: row.productId,
      productName: row.productName,
      deltaOnHand: row.deltaOnHand,
      deltaReserved: row.deltaReserved,
      orderNumber: row.orderNumber,
      rewardTitle: row.rewardTitle,
      employeeName: row.employeeName,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
    })),
    total,
    limit: cappedLimit,
    offset,
  };
};
