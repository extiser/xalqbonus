import { findOffice } from '#server/repositories/offices';
import { listOfficeShowcase } from '#server/repositories/stock';
import { toMemberOffice } from '#server/services/offices/readMemberOffices';
import type { MiniAppShowcaseResponse } from '#shared/types/miniapp';

/**
 * Витрина офиса для водителя: товары, которые можно взять сейчас, и его баланс.
 *
 * Остатки других офисов сюда не попадают: один заказ — один офис, и водитель выбирает офис
 * до витрины (docs/decisions.md → «Каталог: заказ — это касса, остаток живёт по офисам»).
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

  const rows = await listOfficeShowcase(request.officeId);

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
  };
};
