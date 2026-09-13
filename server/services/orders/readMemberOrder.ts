import type { Language } from '#server/generated/prisma/enums';
import { listOrderLines, listPersonOrders } from '#server/repositories/orders';
import { describeMemberOrder } from '#server/services/orders/memberOrderScreen';
import type { MemberOrder } from '#shared/types/miniapp';

/**
 * Один заказ водителя — только свой.
 *
 * `null` — заказа нет **или он чужой**, и различать это наружу нельзя: ответ «заказ есть,
 * но не ваш» подтверждал бы чужой идентификатор. Отсюда же ручка отмены узнаёт, что заказ
 * свой, прежде чем звать `cancelOrder`, — проверку принадлежности сервис отмены оставляет
 * вызывающему.
 */

export type MemberOrderRequest = {
  personId: string;
  orderId: string;
  language: Language;
};

export const readMemberOrder = async (request: MemberOrderRequest): Promise<MemberOrder | null> => {
  const [row] = await listPersonOrders({
    personId: request.personId,
    orderId: request.orderId,
    limit: 1,
  });

  if (!row) {
    return null;
  }

  return describeMemberOrder(row, await listOrderLines([row.id]), request.language);
};
