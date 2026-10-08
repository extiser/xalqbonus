import { Queue, Worker, type Job } from 'bullmq';
import { consola } from 'consola';
import { getQueueConnection } from '#server/queues/connection';
import { runTransactionsRecheck } from '#server/services/fleetTransactions/recheckTransactions';
import { runTransactionsSync } from '#server/services/fleetTransactions/syncTransactions';
import {
  readSyncConfig,
  readTransactionsSyncConfig,
  syncIntervalMs,
  transactionsIntervalMs,
  type ScheduledSyncKind,
  type SyncConfig,
  type TransactionsSyncConfig,
  type TransactionsSyncKind,
} from '#server/services/sync/config';
import { runOrdersSync } from '#server/services/sync/syncOrders';
import { runOrdersCatchup } from '#server/services/sync/syncOrdersCatchup';
import { runRegistrySync } from '#server/services/sync/syncRegistry';

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
 * `SYNC_LIVE_INTERVAL_SEC`, `orders_catchup` — догоняющий: запуск раз в
 * `SYNC_CATCHUP_INTERVAL_SEC` продолжает проход кусками, а новый проход начинается раз
 * в `SYNC_CATCHUP_PASS_EVERY_HOURS` (`syncOrdersCatchup.ts`), `registry` —
 * инкрементальная синхронизация профилей парка со своим выключателем и интервалом.
 * Транзакции парка (issue #358) идут той же очередью и по одному с остальными — ключ тот же:
 * `transactions` — живой сбор с интервалом `SYNC_TRANSACTIONS_INTERVAL_SEC`,
 * `transactions_recheck` — ночное перечитывание последних суток, раз в сутки в 01:00 UTC
 * (06:00 по Ташкенту) планировщиком с `pattern`, а не `every`: к этому часу вчерашние сутки UTC
 * закрыты давно, а нагрузка на ключ ночью меньше.
 * Выключатель снимает планировщик, а не просто перестаёт его заводить: иначе однажды
 * включённое расписание продолжало бы срабатывать после `SYNC_LIVE_ENABLED=false`.
 *
 * **Полного обхода реестра в этом списке нет и быть не должно.** Он берёт весь парк
 * нарезкой, идёт около получаса и запускается по требованию — командой `make sync-registry
 * kind=registry_full`: первое наполнение, подозрение на расхождение, аудит. Рабочий режим
 * реестра — инкрементальный (docs/decisions.md → «Полный обход реестра — режим
 * синхронизации, а не разовый скрипт»).
 */

const log = consola.withTag('queue:sync');

export const SYNC_QUEUE_NAME = 'sync';

/** Идентификаторы планировщиков. Постоянные: по ним расписание обновляется и снимается. */
const SCHEDULER_IDS: Record<ScheduledSyncKind | TransactionsSyncKind, string> = {
  orders: 'orders-live',
  orders_catchup: 'orders-catchup',
  registry: 'registry-live',
  transactions: 'transactions-live',
  transactions_recheck: 'transactions-recheck',
};

/** Перечитывание транзакций — каждый день в 01:00 UTC, 06:00 по Ташкенту. */
const TRANSACTIONS_RECHECK_PATTERN = '0 1 * * *';
const TRANSACTIONS_RECHECK_TIME_ZONE = 'UTC';

export type SyncJobData = { kind: ScheduledSyncKind | TransactionsSyncKind };

export const createSyncQueue = (): Queue<SyncJobData> =>
  new Queue<SyncJobData>(SYNC_QUEUE_NAME, {
    connection: getQueueConnection(),
    defaultJobOptions: {
      // Повтор упавшего прогона очередью не нужен: следующий по расписанию перечитает
      // то же окно целиком — отметка при неуспехе не двигалась. У догона — тот же кусок,
      // с которого запуск упал: пройденные до него уже сдвинули позицию.
      attempts: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  });

const isEnabled = (kind: ScheduledSyncKind, config: SyncConfig): boolean => {
  if (kind === 'orders_catchup') {
    return config.catchupEnabled;
  }

  if (kind === 'registry') {
    return config.registryEnabled;
  }

  return config.liveEnabled;
};

/** Заводит или снимает расписание всех прогонов по нынешнему состоянию окружения. */
export const applySyncSchedule = async (
  queue: Queue<SyncJobData>,
  config: SyncConfig,
  transactionsConfig: TransactionsSyncConfig,
): Promise<void> => {
  for (const kind of ['orders', 'orders_catchup', 'registry'] as const) {
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

  if (transactionsConfig.enabled) {
    const every = transactionsIntervalMs('transactions', transactionsConfig);

    await queue.upsertJobScheduler(
      SCHEDULER_IDS.transactions,
      { every },
      { name: 'transactions', data: { kind: 'transactions' } },
    );
    log.info('Расписание заведено', { kind: 'transactions', everySec: every / 1_000 });
  } else {
    await queue.removeJobScheduler(SCHEDULER_IDS.transactions);
    log.info('Расписание снято', { kind: 'transactions' });
  }

  if (transactionsConfig.recheckEnabled) {
    await queue.upsertJobScheduler(
      SCHEDULER_IDS.transactions_recheck,
      { pattern: TRANSACTIONS_RECHECK_PATTERN, tz: TRANSACTIONS_RECHECK_TIME_ZONE },
      { name: 'transactions_recheck', data: { kind: 'transactions_recheck' } },
    );
    log.info('Расписание заведено', {
      kind: 'transactions_recheck',
      pattern: TRANSACTIONS_RECHECK_PATTERN,
      tz: TRANSACTIONS_RECHECK_TIME_ZONE,
    });
  } else {
    await queue.removeJobScheduler(SCHEDULER_IDS.transactions_recheck);
    log.info('Расписание снято', { kind: 'transactions_recheck' });
  }
};

const isTransactionsKind = (kind: SyncJobData['kind']): kind is TransactionsSyncKind =>
  kind === 'transactions' || kind === 'transactions_recheck';

/** Интервал вида прогона: по нему задача, прождавшая слот, считается просроченной. */
const jobIntervalMs = (kind: SyncJobData['kind']): number =>
  isTransactionsKind(kind)
    ? transactionsIntervalMs(kind, readTransactionsSyncConfig())
    : syncIntervalMs(kind, readSyncConfig());

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

/**
 * Исход задачи: прогон прошёл или задача пропущена как просроченная. По нему воркер отличает
 * перечитывание транзакций, которое было, от пропущенного (issue #438): деньги дашборда
 * пересчитываются только после настоящего.
 */
export type SyncJobOutcome = 'done' | 'skipped';

export const createSyncWorker = (): Worker<SyncJobData, SyncJobOutcome> =>
  new Worker<SyncJobData, SyncJobOutcome>(
    SYNC_QUEUE_NAME,
    async (job) => {
      const timing = jobTiming(job);

      if (isOverdue(timing, jobIntervalMs(job.data.kind))) {
        log.warn('Задача просрочена и пропущена — окно возьмёт следующий прогон', {
          kind: job.data.kind,
          lateSec: Math.round((Date.now() - timing.timestamp - timing.delay) / 1_000),
        });
        return 'skipped';
      }

      if (job.data.kind === 'registry') {
        await runRegistrySync('registry');
        return 'done';
      }

      if (job.data.kind === 'orders_catchup') {
        await runOrdersCatchup();
        return 'done';
      }

      if (job.data.kind === 'transactions') {
        await runTransactionsSync();
        return 'done';
      }

      if (job.data.kind === 'transactions_recheck') {
        await runTransactionsRecheck();
        return 'done';
      }

      await runOrdersSync();
      return 'done';
    },
    {
      connection: getQueueConnection(),
      // Строго по одному: см. про квоту ключа в шапке файла.
      concurrency: 1,
    },
  );
