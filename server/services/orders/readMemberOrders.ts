import type { Language } from '#server/generated/prisma/enums';
import { listOrderLines, listPersonOrders } from '#server/repositories/orders';
import {
  describeMemberOrder,
  groupLinesByOrder,
} from '#server/services/orders/memberOrderScreen';
import type { MiniAppOrdersResponse } from '#shared/types/miniapp';

/**
 * Заказы водителя для экрана «Мои заказы»: висящие сверху с кодом, остальные — с датой
 * и причиной.
 */

/**
 * Сколько заказов показывается.
 *
 * Листания нет: за девятнадцать месяцев старого бота 715 заказов на четыре тысячи водителей,
 * и полсотни у одного человека — это годы обменов. Потолок стоит, чтобы ответ ручки
 * не рос без предела, а не потому, что его кто-то достигнет.
 */
const ORDERS_LIMIT = 50;

export type MemberOrdersRequest = {
  personId: string;
  language: Language;
};

export const readMemberOrders = async (
  request: MemberOrdersRequest,
): Promise<MiniAppOrdersResponse> => {
  const rows = await listPersonOrders({
    personId: request.personId,
    orderId: null,
    limit: ORDERS_LIMIT,
  });

  if (rows.length === 0) {
    return { orders: [] };
  }

  const linesByOrder = groupLinesByOrder(await listOrderLines(rows.map((row) => row.id)));

  return {
    orders: rows.map((row) =>
      describeMemberOrder(row, linesByOrder.get(row.id) ?? [], request.language),
    ),
  };
};
