import { cancelOrder } from '#server/services/orders/cancelOrder';
import { explainOrderFailure } from '#server/services/orders/explainOrderFailure';
import { readMemberOrder } from '#server/services/orders/readMemberOrder';
import { denyMemberOrder } from '#server/utils/memberOrderDenial';
import { requireMember } from '#server/utils/miniAppMember';
import { requireUuidParam } from '#server/utils/query';
import type { MiniAppOrderResponse } from '#shared/types/miniapp';

/**
 * Отмена заказа водителем — только своего и только висящего.
 *
 * «Свой ли» проверяет ручка: `cancelOrder` принимает решение уже проверенным. Чужой заказ
 * отвечает тем же `order_not_found`, что и несуществующий, — подтверждать чужой
 * идентификатор незачем. «Висит ли» проверяет сервис под блокировкой строки: выданный
 * между показом экрана и нажатием заказ получит `order_not_pending`.
 */
export default defineEventHandler(async (event): Promise<MiniAppOrderResponse> => {
  const driver = await requireMember(event);
  const orderId = requireUuidParam(event, 'orderId');
  const request = { personId: driver.personId, orderId, language: driver.language };

  if (!(await readMemberOrder(request))) {
    throw denyMemberOrder({ code: 'order_not_found' }, driver.language);
  }

  try {
    await cancelOrder({ orderId, reason: 'driver' });
  } catch (error) {
    const denial = await explainOrderFailure(error);

    if (denial) {
      throw denyMemberOrder(denial, driver.language);
    }

    throw error;
  }

  const order = await readMemberOrder(request);

  if (!order) {
    throw new Error(`отменённый заказ ${orderId} не прочитался`);
  }

  return { order };
});
