import { listPromoFunnels, readPromoTotals } from '#server/repositories/promo';
import type { PromoList } from '#shared/types/promo';

/**
 * Список меток с воронкой и итоги по всем меткам — экран «Промо» (issue #380). Цифры —
 * за всё время меток; определения — `shared/metrics.ts`, ключи `promo*`.
 */
export const listPromoLinks = async (): Promise<PromoList> => {
  const [rows, totals] = await Promise.all([listPromoFunnels(), readPromoTotals()]);

  return {
    links: rows.map((row) => ({
      code: row.code,
      name: row.name,
      medium: row.medium,
      entry: row.entry,
      placement: row.placement,
      createdAt: row.createdAt.toISOString(),
      went: row.went,
      joined: row.joined,
      firstTrip: row.firstTrip,
      already: row.already,
    })),
    totals,
  };
};
