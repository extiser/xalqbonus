import { Queue, Worker } from 'bullmq';
import { consola } from 'consola';
import { getQueueConnection } from '#server/queues/connection';
import { expireOrders } from '#server/services/orders/expireOrders';
import { expireRewards } from '#server/services/rewards/expireRewards';

/**
 * Очередь заказов. В ней две повторяемые задачи: просрочка заказов и сгорание наград
 * (issue #172). Обе про резерв остатка и обе дешёвые — своей очереди награды не стоят.
 *
 * **Отдельная от синхронизации намеренно.** Очередь `sync` идёт строго по одному прогону
 * из-за узкой квоты Fleet API, а полный обход реестра занимает около получаса: просрочка,
 * вставшая за ним, держала бы резерв товара и списанные баллы лишние полчаса
 * (server/queues/sync.ts).
 *
 * Расписание живёт планировщиком BullMQ, как у синхронизации: идентификатор постоянный,
 * поэтому интервал обновляется на месте, а не заводит второе расписание.
 *
 * Выключателя у просрочки нет. У синхронизации он есть потому, что её прогон ходит
 * во внешний API на квоте, общей с работающим кроном старого бота; здесь же отключённая
 * просрочка — это заказы, висящие вечно, и баллы, списанные навсегда.
 */

const log = consola.withTag('queue:orders');

export const ORDERS_QUEUE_NAME = 'orders';

/** Постоянные идентификаторы расписаний: по ним они обновляются и снимаются. */
const EXPIRY_SCHEDULER_ID = 'orders-expiry';
const REWARD_EXPIRY_SCHEDULER_ID = 'rewards-expiry';

/**
 * Раз в пять минут.
 *
 * Срок заказа — сутки, и пять минут опоздания ни на что не влияют; чаще незачем, реже —
 * значит водитель, отменивший заказ сроком, ждёт возврата баллов дольше, чем смотрит
 * на экран.
 */
const EXPIRY_INTERVAL_MS = 5 * 60 * 1_000;

/**
 * Раз в час. Срок награды считается днями, и час опоздания ни на что не влияет: товар
 * вернётся на полку чуть позже, а водитель к этому времени код уже не показывает.
 */
const REWARD_EXPIRY_INTERVAL_MS = 60 * 60 * 1_000;

export type OrdersJobData = { kind: 'expire' } | { kind: 'expire_rewards' };

export const createOrdersQueue = (): Queue<OrdersJobData> =>
  new Queue<OrdersJobData>(ORDERS_QUEUE_NAME, {
    connection: getQueueConnection(),
    defaultJobOptions: {
      // Повтор упавшего прогона очередью не нужен: следующий через пять минут возьмёт
      // те же заказы — срок у них не двигался, а отмена каждого идёт своей транзакцией.
      attempts: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  });

/** Заводит расписания просрочки и сгорания. Интервалы постоянные, аргументов у цели нет. */
export const applyOrdersSchedule = async (queue: Queue<OrdersJobData>): Promise<void> => {
  await queue.upsertJobScheduler(
    EXPIRY_SCHEDULER_ID,
    { every: EXPIRY_INTERVAL_MS },
    { name: 'expire', data: { kind: 'expire' } },
  );

  await queue.upsertJobScheduler(
    REWARD_EXPIRY_SCHEDULER_ID,
    { every: REWARD_EXPIRY_INTERVAL_MS },
    { name: 'expire_rewards', data: { kind: 'expire_rewards' } },
  );

  log.info('Расписания просрочки и сгорания заведены', {
    ordersEverySec: EXPIRY_INTERVAL_MS / 1_000,
    rewardsEverySec: REWARD_EXPIRY_INTERVAL_MS / 1_000,
  });
};

export const createOrdersWorker = (): Worker<OrdersJobData> =>
  new Worker<OrdersJobData>(
    ORDERS_QUEUE_NAME,
    async (job) => {
      if (job.data.kind === 'expire_rewards') {
        await expireRewards();

        return;
      }

      await expireOrders();
    },
    {
      connection: getQueueConnection(),
      // По одному: два прогона разом взяли бы одни и те же заказы и передрались
      // за блокировки их строк, ничего при этом не ускорив. Сгорание наград идёт той же
      // очередью по очереди с просрочкой: оба трогают строки остатка.
      concurrency: 1,
    },
  );
