import { readCatalog } from '#server/services/products/readCatalog';
import { requireMember } from '#server/utils/miniAppMember';
import type { MiniAppCatalogResponse } from '#shared/types/miniapp';

// Общий каталог без офиса: товары, которые можно взять хотя бы в одном работающем офисе,
// офисы каждого с остатком и баланс того, кто смотрит (issue #234).
export default defineEventHandler(async (event): Promise<MiniAppCatalogResponse> => {
  const driver = await requireMember(event);

  return readCatalog({ balance: driver.points, isDemo: driver.isDemo });
});
