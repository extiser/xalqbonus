/**
 * Ставит задачу синхронизации в очередь воркера, а не выполняет её на месте (issue #438).
 *
 * Разовые цели `sync-orders`, `sync-transactions-recheck` и другие идут мимо очереди — тем же
 * кодом, но без воркера, и его реакции на конец задачи не срабатывают. Эта цель нужна, когда
 * проверяется именно реакция: после `transactions_recheck` воркер ставит пересчёт денег
 * дашборда (`server/queues/worker.ts`). Задачу берёт работающий воркер стека, с его окружением —
 * сколько суток перечитывать, решает его `SYNC_TRANSACTIONS_RECHECK_DAYS`.
 *
 * Запуск: make sync-enqueue kind=transactions_recheck
 */
import { consola } from 'consola';

import { closeQueueConnection } from '#server/queues/connection';
import { createSyncQueue, type SyncJobData } from '#server/queues/sync';

const log = consola.withTag('sync-enqueue');

const KINDS: readonly SyncJobData['kind'][] = [
  'orders',
  'orders_catchup',
  'registry',
  'transactions',
  'transactions_recheck',
];

const isKind = (value: string): value is SyncJobData['kind'] => KINDS.some((kind) => kind === value);

const main = async (): Promise<void> => {
  const kind = process.argv[2] ?? '';

  if (!isKind(kind)) {
    throw new Error(`вид задачи — один из ${KINDS.join(', ')}, получено «${kind}»`);
  }

  const queue = createSyncQueue();

  try {
    const job = await queue.add(kind, { kind });

    log.info('Задача поставлена в очередь воркера', { kind, jobId: job.id });
  } finally {
    await queue.close();
  }
};

main()
  .catch((error: unknown) => {
    consola.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeQueueConnection());
