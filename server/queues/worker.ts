import { consola } from 'consola';
import { writeFileSync } from 'node:fs';
import { closeQueueConnection, getQueueConnection } from '#server/queues/connection';
import {
  closeNotificationsQueue,
  createNotificationsWorker,
  getNotificationsQueue,
} from '#server/queues/notifications';
import { applySyncSchedule, createSyncQueue, createSyncWorker } from '#server/queues/sync';
import { failAbandonedRuns } from '#server/repositories/syncRuns';
import { readSyncConfig } from '#server/services/sync/config';

const log = consola.withTag('worker');

// Отметка живого цикла: файл трогается раз в интервал, healthcheck контейнера смотрит на его
// возраст. Проверять сам процесс смысла нет — Docker и так знает, что тот запущен; вопрос
// в том, крутится ли цикл и держится ли соединение с очередью.
const HEARTBEAT_FILE = process.env.WORKER_HEARTBEAT_FILE ?? '/tmp/worker-heartbeat';
const HEARTBEAT_INTERVAL_MS = 10_000;

const connection = getQueueConnection();

const writeHeartbeat = (): void => {
  if (connection.status !== 'ready') {
    log.warn('соединение с очередью не готово', { status: connection.status });
    return;
  }

  writeFileSync(HEARTBEAT_FILE, String(Date.now()));
};

const heartbeat = setInterval(writeHeartbeat, HEARTBEAT_INTERVAL_MS);

connection.on('ready', () => {
  log.info('соединение с очередью установлено');
  writeHeartbeat();
});

connection.on('error', (error: Error) => {
  log.warn('соединение с очередью отвалилось', { error: error.message });
});

// Расписание синхронизации заказов. Конфигурация читается один раз на старте: смена
// интервала или выключателя — это перезапуск контейнера воркера, а не правка на лету.
const config = readSyncConfig();
const syncQueue = createSyncQueue();
const syncWorker = createSyncWorker();

syncWorker.on('failed', (job, error) => {
  // Прогон уже закрыт строкой `sync_runs` со статусом `failed` и не сдвинул отметку —
  // здесь остаётся только сказать об этом в лог воркера.
  log.error('прогон синхронизации упал', { kind: job?.data.kind, error: error.message });
});

syncWorker.on('error', (error: Error) => {
  log.warn('очередь синхронизации сообщила об ошибке', { error: error.message });
});

// Уведомления — отдельная очередь и отдельный воркер. Общей очереди с синхронизацией
// у них быть не может: та идёт строго по одному прогону, и уведомление, вставшее
// за получасовым обходом реестра, приехало бы к водителю через полчаса
// (server/queues/notifications.ts).
const notificationsQueue = getNotificationsQueue();
const notificationsWorker = createNotificationsWorker(notificationsQueue);

notificationsWorker.on('completed', (job, outcome) => {
  // Исход каждого задания — строка в логе. Сама отправка пишет свою, эта отвечает
  // на вопрос «очередь жива и разгребается».
  log.debug('задание уведомления выполнено', { template: job.name, outcome });
});

notificationsWorker.on('failed', (job, error) => {
  log.error('уведомление не отправлено', {
    template: job?.name,
    attempts: job?.attemptsMade,
    error: error.message,
  });
});

notificationsWorker.on('error', (error: Error) => {
  log.warn('очередь уведомлений сообщила об ошибке', { error: error.message });
});

// Прошлый процесс мог уйти по SIGKILL, не закрыв свою строку прогона: `syncWorker.close()`
// на SIGTERM дожидается прогона, а `docker stop` по таймауту и убийство по памяти такой
// возможности не дают. Подбираем брошенное — иначе журнал прогонов копит вечно бегущие строки.
const abandoned = await failAbandonedRuns(
  new Date(Date.now() - config.abandonedRunMinutes * 60_000),
);

if (abandoned > 0) {
  log.warn('закрыты брошенные прогоны предыдущего процесса', {
    runs: abandoned,
    olderThanMinutes: config.abandonedRunMinutes,
  });
}

await applySyncSchedule(syncQueue, config);

log.info('воркер запущен', {
  liveEnabled: config.liveEnabled,
  liveIntervalSec: config.liveIntervalSec,
  catchupEnabled: config.catchupEnabled,
  overlapMinutes: config.overlapMinutes,
  lagSeconds: config.lagSeconds,
  registryEnabled: config.registryEnabled,
  registryIntervalSec: config.registryIntervalSec,
});

const shutdown = async (signal: string): Promise<void> => {
  log.info('останов воркера', { signal });
  clearInterval(heartbeat);
  // Воркер закрывается первым и дожидается текущего прогона: оборванная на середине
  // синхронизация оставила бы строку `sync_runs` навсегда в состоянии `running`.
  await syncWorker.close();
  await syncQueue.close();
  // Воркер уведомлений дожидается отправок, которые уже в руках: оборванная на середине
  // отправка — это сообщение, про которое неизвестно, ушло оно или нет.
  await notificationsWorker.close();
  await closeNotificationsQueue();
  await closeQueueConnection();
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
