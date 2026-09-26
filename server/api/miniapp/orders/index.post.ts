import {
  DuplicateOrderItemError,
  EmptyOrderError,
  InvalidOrderQuantityError,
} from '#server/services/orders/errors';
import { explainOrderFailure } from '#server/services/orders/explainOrderFailure';
import { placeOrder, type PlaceOrderItem } from '#server/services/orders/placeOrder';
import { readMemberOrder } from '#server/services/orders/readMemberOrder';
import { denyMemberOrder } from '#server/utils/memberOrderDenial';
import { requireMember } from '#server/utils/miniAppMember';
import { readUuid } from '#server/utils/query';
import type { MiniAppOrderResponse, MiniAppPlaceOrderRequestBody } from '#shared/types/miniapp';

/**
 * Оформление заказа водителем.
 *
 * Логики оформления здесь нет: цены, остаток, баланс и резерв решает `placeOrder` одной
 * транзакцией. Ручка разбирает тело, зовёт сервис и переводит его отказ в код и текст
 * на языке водителя.
 *
 * Чей заказ — решает подпись, а не тело: человека в запросе нет.
 */

const badRequest = (message: string) =>
  createError({ statusCode: 400, statusMessage: 'Bad Request', message });

/** Позиции из тела. Форму проверяем здесь, смысл — количество, дубли, пустоту — ядро. */
const readItems = (value: unknown): PlaceOrderItem[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  const items: PlaceOrderItem[] = [];

  for (const entry of value as unknown[]) {
    const record = typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {};
    const productId = readUuid(record.productId);

    if (!productId || typeof record.quantity !== 'number') {
      return null;
    }

    items.push({ productId, quantity: record.quantity });
  }

  return items;
};

export default defineEventHandler(async (event): Promise<MiniAppOrderResponse> => {
  const driver = await requireMember(event);
  const body = await readBody<Partial<MiniAppPlaceOrderRequestBody> | null>(event);
  const officeId = readUuid(body?.officeId);
  const items = readItems(body?.items);

  if (!officeId || !items) {
    throw badRequest('нужны officeId и позиции { productId, quantity }');
  }

  let orderId: string;

  try {
    const placed = await placeOrder({
      personId: driver.personId,
      officeId,
      items,
      actor: 'mini_app',
      driverIsDemo: driver.isDemo,
    });

    orderId = placed.orderId;
  } catch (error) {
    const denial = await explainOrderFailure(error);

    if (denial) {
      throw denyMemberOrder(denial, driver.language);
    }

    // Пустой заказ, дробное количество, товар дважды — экран такого не шлёт, и водителю
    // объяснять тут нечего: это испорченный запрос.
    if (
      error instanceof EmptyOrderError ||
      error instanceof InvalidOrderQuantityError ||
      error instanceof DuplicateOrderItemError
    ) {
      throw badRequest(error.message);
    }

    throw error;
  }

  // Заказ читается тем же путём, что в «Моих заказах»: экран после оформления обязан
  // показать ровно то, что водитель увидит, открыв этот заказ из списка.
  const order = await readMemberOrder({
    personId: driver.personId,
    orderId,
    language: driver.language,
  });

  if (!order) {
    throw new Error(`оформленный заказ ${orderId} не прочитался`);
  }

  return { order };
});
