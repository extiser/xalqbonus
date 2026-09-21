import { consola } from 'consola';
import { db } from '#server/db';
import {
  listExpiredAwaitingRewards,
  lockAwaitingRewardById,
  markRewardExpired,
} from '#server/repositories/rewards';
import { lockStockRows, writeStockMovement } from '#server/repositories/stock';

/**
 * Сгорание: ждущие награды с истёкшим сроком переходят в `expired`, а товар возвращается
 * в свободный остаток движением `reward_release` (issue #172). Парк получает товар обратно,
 * а водитель видит в списке причину, а не пустоту.
 *
 * **Каждая награда сгорает своей транзакцией** — тем же доводом, что просрочка заказов: одна
 * упавшая не должна держать остальные, а несгоревшая — это приз, запертый в резерве.
 *
 * Награда, выданная между выборкой и сгоранием, — штатный исход, а не отказ: водитель успел
 * к стойке на секунду раньше прогона.
 */

const log = consola.withTag('rewards:expire');

/**
 * Сколько наград за прогон. Прогон раз в час, а ждущих наград на весь парк сотни: потолок
 * не про нагрузку, а про очередь, накопившуюся после долгого простоя. Остаток — следующим.
 */
const BATCH_SIZE = 200;

export type ExpireRewardsSummary = {
  found: number;
  expired: number;
  /** Успели выдать между выборкой и сгоранием. */
  alreadyClosed: number;
  /** Не сгорели: разбирать по логу. Следующий прогон попробует снова. */
  failed: number;
};

/** Одна награда. `false` — она уже не ждёт: выдана раньше прогона. */
const expireReward = async (rewardId: string): Promise<boolean> =>
  db.$transaction(async (transaction) => {
    const reward = await lockAwaitingRewardById(transaction, rewardId);

    if (!reward) {
      return false;
    }

    // Товар и офис у награды-товара есть всегда — проверкой `rewards_kind_fields_check`.
    const shelf =
      reward.kind === 'product' && reward.officeId !== null && reward.productId !== null
        ? { officeId: reward.officeId, productId: reward.productId }
        : null;

    if (shelf) {
      await lockStockRows(transaction, shelf.officeId, [shelf.productId]);
    }

    const updated = await markRewardExpired(transaction, reward.id, new Date());

    if (updated !== 1) {
      throw new Error(`сгорание награды ${reward.id} не изменило ни одной строки`);
    }

    if (shelf) {
      await writeStockMovement(transaction, {
        officeId: shelf.officeId,
        productId: shelf.productId,
        kind: 'reward_release',
        deltaOnHand: 1,
        deltaReserved: -1,
        rewardId: reward.id,
      });
    }

    return true;
  });

export const expireRewards = async (): Promise<ExpireRewardsSummary> => {
  const candidates = await listExpiredAwaitingRewards(BATCH_SIZE);
  const summary: ExpireRewardsSummary = {
    found: candidates.length,
    expired: 0,
    alreadyClosed: 0,
    failed: 0,
  };

  for (const { id } of candidates) {
    try {
      if (await expireReward(id)) {
        summary.expired += 1;
      } else {
        summary.alreadyClosed += 1;
      }
    } catch (error) {
      summary.failed += 1;
      log.error('награда не сгорела', {
        rewardId: id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Итог прогона одной строкой: прогон, о котором в логе ничего нет, неотличим
  // от незаведённого расписания.
  log.info('прогон сгорания наград завершён', summary);

  return summary;
};
