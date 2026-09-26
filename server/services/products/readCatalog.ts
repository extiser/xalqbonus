import { type CatalogProductRow, listCatalogProducts } from '#server/repositories/stock';
import { readMemberOffices } from '#server/services/offices/readMemberOffices';
import type { CatalogProduct, MemberOffice, MiniAppCatalogResponse } from '#shared/types/miniapp';

/**
 * Общий каталог для водителя: все товары, которые можно взять хотя бы в одном работающем офисе,
 * и где именно (issue #234).
 *
 * Каталог открывается без офиса: офис нужен только в момент, когда товар кладут в корзину,
 * и тогда шторка «Где заберёте?» показывает офисы нажатого товара с его остатком
 * (`_reference/design/catalog/catalog-no-office.md`). Правила заказа от этого не меняются —
 * один заказ — один офис, и оформление по-прежнему идёт с витрины офиса.
 */

export type CatalogRequest = {
  /** Баланс водителя со счёта — тот же, что стоит на экране участника. */
  balance: bigint;
  /** Водитель демо: ему видны ДЕМО ОФИС и демо-товары (issue #212). */
  isDemo: boolean;
};

/**
 * Собирает строки «товар — офис» в товары. Офисы товара — порядком `offices`: шторка
 * показывает их тем же порядком, что шторка смены офиса. Офис вне списка — архивный
 * между двумя запросами — в товар не попадает, а товар без офисов — в каталог.
 */
export const groupCatalogProducts = (
  rows: readonly CatalogProductRow[],
  offices: readonly MemberOffice[],
): CatalogProduct[] => {
  const officeOrder = new Map(offices.map((office, index) => [office.officeId, index]));
  const products = new Map<string, CatalogProduct>();

  for (const row of rows) {
    if (!officeOrder.has(row.officeId)) {
      continue;
    }

    const product = products.get(row.productId) ?? {
      productId: row.productId,
      name: row.name,
      description: row.description,
      photoPath: row.photoPath,
      updatedAt: row.updatedAt.toISOString(),
      pricePoints: row.pricePoints,
      offices: [],
    };

    product.offices.push({ officeId: row.officeId, available: row.available });
    products.set(row.productId, product);
  }

  for (const product of products.values()) {
    product.offices.sort(
      (left, right) => (officeOrder.get(left.officeId) ?? 0) - (officeOrder.get(right.officeId) ?? 0),
    );
  }

  return [...products.values()];
};

export const readCatalog = async (request: CatalogRequest): Promise<MiniAppCatalogResponse> => {
  const [{ offices }, rows] = await Promise.all([
    readMemberOffices({ isDemo: request.isDemo }),
    listCatalogProducts(request.isDemo),
  ]);

  return {
    balancePoints: Number(request.balance),
    offices,
    products: groupCatalogProducts(rows, offices),
  };
};
