import { consola } from 'consola';
import { listExpiredPendingOrders } from '#server/repositories/orders';
import { cancelOrder } from '#server/services/orders/cancelOrder';
import { OrderNotPendingError } from '#server/services/orders/errors';

/**
 * Просрочка: висящие заказы с истёкшим сроком отменяются причиной `expired`.
 *
 * Окно — сутки (docs/decisions.md → «Каталог: заказ — это касса, остаток живёт по офисам»):
 * медиана от оформления до выдачи 0,7 минуты, дольше получаса за девятнадцать месяцев
 * провисели 29 заказов из 627. Автоотмена закрывает те несколько процентов, в которых
 * водитель оформил и не пришёл, — иначе товар остаётся в резерве навсегда, а баллы
 * у водителя списанными.
 *
 * **Каждый заказ отменяется своей транзакцией**, тем же `cancelOrder`, каким отменяет
 * водитель и сотрудник. Одна транзакция на весь прогон означала бы, что один упавший заказ
 * останавливает остальные, — а висящий заказ, который не смогли отменить, это замороженный
 * товар и замороженные баллы конкретного человека.
 *
 * Заказ, закрытый между выборкой и отменой, — штатный исход, а не отказ: водитель успел
 * прийти в офис, и выдача произошла раньше просрочки на секунду.
 */

const log = consola.withTag('orders:expire');

/**
 * Сколько заказов берётся за прогон.
 *
 * Прогон идёт раз в пять минут, а висящих заказов на весь парк десяток: потолок здесь —
 * не про нагрузку, а про то, чтобы накопившаяся после долгого простоя очередь не шла одним
 * прогоном в тысячу транзакций. Остаток возьмёт следующий прогон через пять минут.
 */
const BATCH_SIZE = 100;

export type ExpireOrdersSummary = {
  /** Сколько просроченных заказов взято в работу. */
  found: number;
  /** Отменено сейчас. */
  cancelled: number;
  /** Успели закрыться сами между выборкой и отменой: выдача или отмена водителем. */
  alreadyClosed: number;
  /** Не отменились: разбирать по логу. Следующий прогон попробует их снова. */
  failed: number;
};

export const expireOrders = async (): Promise<ExpireOrdersSummary> => {
  const expired = await listExpiredPendingOrders(BATCH_SIZE);
  const summary: ExpireOrdersSummary = {
    found: expired.length,
    cancelled: 0,
    alreadyClosed: 0,
    failed: 0,
  };

  for (const order of expired) {
    try {
      await cancelOrder({ orderId: order.id, reason: 'expired' });
      summary.cancelled += 1;
    } catch (error) {
      if (error instanceof OrderNotPendingError) {
        summary.alreadyClosed += 1;
        continue;
      }

      summary.failed += 1;
      log.error('просроченный заказ не отменился', {
        orderId: order.id,
        number: order.number,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Итог прогона — одной строкой: прогон, о котором в логе ничего нет, неотличим
  // от незаведённого расписания.
  log.info('прогон просрочки завершён', summary);

  return summary;
};
