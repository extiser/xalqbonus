import { Queue, Worker } from 'bullmq';
import { consola } from 'consola';
import { getQueueConnection } from '#server/queues/connection';
import { recomputePersonDays } from '#server/services/metrics/recomputePersonDays';

/**
 * Очередь метрик дашборда (issue #371). В ней одна повторяемая задача — ночной пересчёт
 * готовой таблицы `metric_person_days`.
 *
 * **Своя, а не `orders` или `sync`.** Пересчёт идёт секунды или минуты, и просрочка заказов
 * за ним стоять не должна; синхронизация идёт строго по одному прогону, и пересчёт, вставший
 * за получасовым обходом реестра, сдвинулся бы на полчаса.
 *
 * Расписание — планировщиком BullMQ с постоянным идентификатором, как у остальных очередей:
 * время обновляется на месте, а не заводит второе расписание. Выключателя нет: пересчёт
 * не ходит во внешний API и ничего, кроме своей таблицы, не пишет.
 */

const log = consola.withTag('queue:metrics');

export const METRICS_QUEUE_NAME = 'metrics';

/** Постоянный идентификатор расписания: по нему оно обновляется и снимается. */
const RECOMPUTE_SCHEDULER_ID = 'metrics-recompute';

/**
 * Каждый день в 03:00 по Ташкенту. Вчерашние сутки к этому часу закрыты, а ночная копия базы
 * снимается в 04:00 — и уезжает уже с пересчитанной таблицей.
 */
const RECOMPUTE_PATTERN = '0 3 * * *';
const RECOMPUTE_TIME_ZONE = 'Asia/Tashkent';

export type MetricsJobData = { kind: 'recompute' };

export const createMetricsQueue = (): Queue<MetricsJobData> =>
  new Queue<MetricsJobData>(METRICS_QUEUE_NAME, {
    connection: getQueueConnection(),
    defaultJobOptions: {
      // Повтор упавшего прогона очередью не нужен: его повторит следующая ночь, а таблица
      // до тех пор остаётся прежней — пересчёт пишет её одной транзакцией.
      attempts: 1,
      removeOnComplete: { count: 30 },
      removeOnFail: { count: 30 },
    },
  });

/** Заводит расписание ночного пересчёта. Время постоянное, аргументов у цели нет. */
export const applyMetricsSchedule = async (queue: Queue<MetricsJobData>): Promise<void> => {
  await queue.upsertJobScheduler(
    RECOMPUTE_SCHEDULER_ID,
    { pattern: RECOMPUTE_PATTERN, tz: RECOMPUTE_TIME_ZONE },
    { name: 'recompute', data: { kind: 'recompute' } },
  );

  log.info('Расписание пересчёта метрик заведено', {
    pattern: RECOMPUTE_PATTERN,
    tz: RECOMPUTE_TIME_ZONE,
  });
};

export const createMetricsWorker = (): Worker<MetricsJobData> =>
  new Worker<MetricsJobData>(
    METRICS_QUEUE_NAME,
    async () => {
      const summary = await recomputePersonDays();

      log.info('Пересчёт метрик закончен', summary);
    },
    {
      connection: getQueueConnection(),
      // По одному: два пересчёта разом удаляли бы и писали одну и ту же таблицу.
      concurrency: 1,
    },
  );
