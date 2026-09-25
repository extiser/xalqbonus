import { findOffice } from '#server/repositories/offices';
import { listCatalogProducts, listOfficeShowcase } from '#server/repositories/stock';
import { toMemberOffice } from '#server/services/offices/readMemberOffices';
import type { MiniAppShowcaseResponse, MissingProduct } from '#shared/types/miniapp';

/**
 * Витрина офиса для водителя: товары, которые можно взять сейчас, и его баланс.
 *
 * Остатки других офисов сюда не попадают: один заказ — один офис
 * (docs/decisions.md → «Каталог: заказ — это касса, остаток живёт по офисам»). Товары общего
 * каталога, которых в этом офисе нет, приходят отдельным списком — без остатка и без права
 * заказа: экран показывает их приглушёнными в конце, чтобы каталог не отфильтровывался молча
 * (issue #234).
 *
 * `null` — офиса нет или он архивный. Для водителя это одно и то же: здесь ничего не взять.
 */

export type OfficeShowcaseRequest = {
  officeId: string;
  /** Баланс водителя со счёта — тот же, что стоит на экране участника. */
  balance: bigint;
};

export const readOfficeShowcase = async (
  request: OfficeShowcaseRequest,
): Promise<MiniAppShowcaseResponse | null> => {
  const office = await findOffice(request.officeId);

  if (!office || office.archivedAt !== null) {
    return null;
  }

  const [rows, catalogRows] = await Promise.all([listOfficeShowcase(request.officeId), listCatalogProducts()]);
  const present = new Set(rows.map((row) => row.productId));
  const missing = new Map<string, MissingProduct>();

  // Строк у товара каталога по одной на офис: берётся первая, остальные — тот же товар.
  for (const row of catalogRows) {
    if (!present.has(row.productId) && !missing.has(row.productId)) {
      missing.set(row.productId, {
        productId: row.productId,
        name: row.name,
        photoPath: row.photoPath,
        updatedAt: row.updatedAt.toISOString(),
        pricePoints: row.pricePoints,
      });
    }
  }

  return {
    office: toMemberOffice(office),
    balancePoints: Number(request.balance),
    products: rows.map((row) => ({
      productId: row.productId,
      name: row.name,
      description: row.description,
      photoPath: row.photoPath,
      updatedAt: row.updatedAt.toISOString(),
      pricePoints: row.pricePoints,
      available: row.available,
    })),
    missingProducts: [...missing.values()],
  };
};
