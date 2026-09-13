import { readMemberOrders } from '#server/services/orders/readMemberOrders';
import { requireMember } from '#server/utils/miniAppMember';
import type { MiniAppOrdersResponse } from '#shared/types/miniapp';

// Заказы того, кто открыл приложение: висящие сверху, дальше свежие.
export default defineEventHandler(async (event): Promise<MiniAppOrdersResponse> => {
  const driver = await requireMember(event);

  return readMemberOrders({ personId: driver.personId, language: driver.language });
});
