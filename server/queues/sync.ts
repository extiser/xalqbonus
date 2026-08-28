import { Queue, Worker, type Job } from 'bullmq';
import { consola } from 'consola';
import { getQueueConnection } from '#server/queues/connection';
import type { OrdersSyncKind } from '#server/services/sync/buildOrdersWindow';
import { readSyncConfig, type SyncConfig } from '#server/services/sync/config';
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

/** Сколько миллисекунд между запусками у этого вида прогона. */
const intervalMs = (kind: OrdersSyncKind, config: SyncConfig): number =>
  kind === 'orders_catchup' ? config.catchupIntervalSec * 1_000 : config.liveIntervalSec * 1_000;

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

    const every = intervalMs(kind, config);

    await queue.upsertJobScheduler(schedulerId, { every }, { name: kind, data: { kind } });
    log.info('Расписание заведено', { kind, everySec: every / 1_000 });
  }
};

/**
 * Задача, пролежавшая в очереди дольше собственного интервала, выполняться не должна:
 * пока она ждала, накопилась очередь таких же, и каждая из них запросит у API то же самое
 * окно. Пропустить её безопасно — окно строится от отметки, а не от времени постановки,
 * и ни один заказ от пропуска не теряется.
 */
const isStale = (job: Job<SyncJobData>, config: SyncConfig): boolean =>
  Date.now() - job.timestamp > intervalMs(job.data.kind, config);

export const createSyncWorker = (): Worker<SyncJobData> =>
  new Worker<SyncJobData>(
    SYNC_QUEUE_NAME,
    async (job) => {
      const config = readSyncConfig();

      if (isStale(job, config)) {
        log.warn('Задача просрочена и пропущена — окно возьмёт следующий прогон', {
          kind: job.data.kind,
          ageSec: Math.round((Date.now() - job.timestamp) / 1_000),
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
