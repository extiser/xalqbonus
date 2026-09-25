import { Queue, Worker } from 'bullmq';
import { consola } from 'consola';
import { getQueueConnection } from '#server/queues/connection';
import { creditDueGifts } from '#server/services/gifts/creditDueGifts';
import { expireOrders } from '#server/services/orders/expireOrders';
import { expireRewards } from '#server/services/rewards/expireRewards';

/**
 * Очередь заказов. В ней три повторяемые задачи: просрочка заказов, сгорание наград
 * (issue #172) и автозачисление подарков (issue #219). Все дешёвые — своей очереди
 * награды не стоят. Подарок по сроку не сгорает, а ложится на баланс, но живёт рядом
 * со сгоранием: это та же работа «срок награды наступил», тем же периодом.
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
const GIFT_CREDIT_SCHEDULER_ID = 'gifts-credit';

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

export type OrdersJobData =
  | { kind: 'expire' }
  | { kind: 'expire_rewards' }
  | { kind: 'credit_gifts' };

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

/**
 * Заводит расписания просрочки, сгорания и автозачисления. Интервалы постоянные, аргументов
 * у цели нет. Автозачисление идёт периодом сгорания: срок подарка — конец суток парка, и час
 * опоздания ни на что не влияет — баллы придут к утру.
 */
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

  await queue.upsertJobScheduler(
    GIFT_CREDIT_SCHEDULER_ID,
    { every: REWARD_EXPIRY_INTERVAL_MS },
    { name: 'credit_gifts', data: { kind: 'credit_gifts' } },
  );

  log.info('Расписания просрочки, сгорания и автозачисления заведены', {
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

      if (job.data.kind === 'credit_gifts') {
        await creditDueGifts();

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
