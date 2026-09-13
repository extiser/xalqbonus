import { findOffice } from '#server/repositories/offices';
import { listOfficeStock } from '#server/repositories/stock';
import type { OfficeStockResponse } from '#shared/types/catalog';

/**
 * Таблица остатков офиса: весь каталог с двумя числами на строку.
 *
 * Весь каталог, а не только пришедшее: приход в офис, где товара ещё не было, — штатный
 * случай, и выбирать товар для прихода надо из каталога. Товар без движений показывается
 * нулями, а не отсутствием строки.
 *
 * `null` — офиса нет. Решает, что на это ответить, ручка.
 */
export const readOfficeStock = async (officeId: string): Promise<OfficeStockResponse | null> => {
  const office = await findOffice(officeId);

  if (!office) {
    return null;
  }

  const rows = await listOfficeStock(officeId);

  return {
    officeId,
    rows: rows.map((row) => ({
      productId: row.productId,
      name: row.name,
      pricePoints: row.pricePoints,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      onHand: row.onHand,
      reserved: row.reserved,
    })),
  };
};
