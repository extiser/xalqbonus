import { Queue, Worker, type Job } from 'bullmq';
import { consola } from 'consola';
import { getQueueConnection } from '#server/queues/connection';
import {
  readSyncConfig,
  syncIntervalMs,
  type OrdersSyncKind,
  type SyncConfig,
} from '#server/services/sync/config';
import { runOrdersSync } from '#server/services/sync/syncOrders';

/**
 * Очередь синхронизации.
 *
 * **Очередь одна на все прогоны, и обрабатывается она по одному.** Причина не в нагрузке:
 * квота ключа Fleet API одна, делится с работающим кроном старого бота, и два прогона,
 * пошедших разом, отбирают запросы друг у друга и получают отказы по лимиту вместо данных
 * (docs/decisions.md → «Квота внешнего API узкая»). Заодно это и есть требование
 * «два прогона одного вида не идут одновременно».
 *
 * Расписание живёт планировщиками BullMQ: `orders` — скользящий прогон с интервалом
 * `SYNC_LIVE_INTERVAL_SEC`, `orders_catchup` — догоняющий раз в сутки. Выключатель
 * снимает планировщик, а не просто перестаёт его заводить: иначе однажды включённое
 * расписание продолжало бы срабатывать после `SYNC_LIVE_ENABLED=false`.
 */

const log = consola.withTag('queue:sync');

export const SYNC_QUEUE_NAME = 'sync';

/** Идентификаторы планировщиков. Постоянные: по ним расписание обновляется и снимается. */
const SCHEDULER_IDS: Record<OrdersSyncKind, string> = {
  orders: 'orders-live',
  orders_catchup: 'orders-catchup',
};

export type SyncJobData = { kind: OrdersSyncKind };

export const createSyncQueue = (): Queue<SyncJobData> =>
  new Queue<SyncJobData>(SYNC_QUEUE_NAME, {
    connection: getQueueConnection(),
    defaultJobOptions: {
      // Повтор упавшего прогона очередью не нужен: следующий по расписанию перечитает
      // то же окно целиком — отметка при неуспехе не двигалась.
      attempts: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  });

const isEnabled = (kind: OrdersSyncKind, config: SyncConfig): boolean =>
  kind === 'orders_catchup' ? config.catchupEnabled : config.liveEnabled;

/** Заводит или снимает расписание обоих прогонов по нынешнему состоянию окружения. */
export const applySyncSchedule = async (
  queue: Queue<SyncJobData>,
  config: SyncConfig,
): Promise<void> => {
  for (const kind of ['orders', 'orders_catchup'] as const) {
    const schedulerId = SCHEDULER_IDS[kind];

    if (!isEnabled(kind, config)) {
      await queue.removeJobScheduler(schedulerId);
      log.info('Расписание снято', { kind });
      continue;
    }

    const every = syncIntervalMs(kind, config);

    await queue.upsertJobScheduler(schedulerId, { every }, { name: kind, data: { kind } });
    log.info('Расписание заведено', { kind, everySec: every / 1_000 });
  }
};

/** Когда задача должна была пойти в работу и когда её поставили в очередь. */
export type ScheduledJobTiming = {
  /** Момент постановки. У планировщика это момент, когда он произвёл задачу на будущий слот. */
  timestamp: number;
  /** Задержка до слота. Ровно на неё задача и лежит в очереди, ничего не ожидая. */
  delay: number;
};

/**
 * Задача, прождавшая свой слот дольше собственного интервала, выполняться не должна:
 * пока она ждала, накопилась очередь таких же, и каждая запросит у API одно и то же окно.
 * Пропустить её безопасно — окно строится от отметки, а не от времени постановки задачи,
 * и ни один заказ от пропуска не теряется.
 *
 * Считается от **срока**, а не от постановки. Планировщик BullMQ производит задачу заранее
 * и кладёт её отлежаться с задержкой до слота: `timestamp` у неё на целый интервал старше
 * момента запуска всегда, даже когда очередь пуста. Отсчёт от постановки поэтому объявлял
 * просроченной каждую задачу расписания — и синхронизация замолкала после первого прогона.
 */
export const isOverdue = (
  timing: ScheduledJobTiming,
  intervalMilliseconds: number,
  now: number = Date.now(),
): boolean => now - (timing.timestamp + timing.delay) > intervalMilliseconds;

const jobTiming = (job: Job<SyncJobData>): ScheduledJobTiming => ({
  timestamp: job.timestamp,
  delay: job.opts.delay ?? 0,
});

export const createSyncWorker = (): Worker<SyncJobData> =>
  new Worker<SyncJobData>(
    SYNC_QUEUE_NAME,
    async (job) => {
      const config = readSyncConfig();

      const timing = jobTiming(job);

      if (isOverdue(timing, syncIntervalMs(job.data.kind, config))) {
        log.warn('Задача просрочена и пропущена — окно возьмёт следующий прогон', {
          kind: job.data.kind,
          lateSec: Math.round((Date.now() - timing.timestamp - timing.delay) / 1_000),
        });
        return;
      }

      await runOrdersSync(job.data.kind);
    },
    {
      connection: getQueueConnection(),
      // Строго по одному: см. про квоту ключа в шапке файла.
      concurrency: 1,
    },
  );
