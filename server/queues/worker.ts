import { consola } from 'consola';
import { writeFileSync } from 'node:fs';
import { getQueueConnection } from '#server/queues/connection';

const log = consola.withTag('worker');

// Отметка живого цикла: файл трогается раз в интервал, healthcheck контейнера смотрит на его
// возраст. Проверять сам процесс смысла нет — Docker и так знает, что тот запущен; вопрос
// в том, крутится ли цикл и держится ли соединение с очередью.
const HEARTBEAT_FILE = process.env.WORKER_HEARTBEAT_FILE ?? '/tmp/worker-heartbeat';
const HEARTBEAT_INTERVAL_MS = 10_000;

const connection = getQueueConnection();

// Очередей пока нет: воркер поднят отдельным контейнером на этапе 0, задачи в него
// приезжают на этапе синхронизации (docs/roadmap.md).
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

const shutdown = async (signal: string): Promise<void> => {
  log.info('останов воркера', { signal });
  clearInterval(heartbeat);
  await connection.quit();
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

log.info('воркер запущен');
