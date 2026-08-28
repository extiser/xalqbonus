import { consola } from 'consola';
import { pingDatabase } from '#server/repositories/health';
import type Redis from 'ioredis';
import { getQueueConnection } from '#server/queues/connection';
import type { DependencyState, ReadinessChecks } from '#server/types/health';

const log = consola.withTag('health:dependencies');

// Потолок ожидания одной зависимости. Проверки идут параллельно, потолок всей пробы тот же.
const DEPENDENCY_TIMEOUT_MS = 2000;

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Гоняет одну пробу под потолком ожидания и переводит исход в состояние зависимости.
 * Наружу не бросает никогда: отказ — down, молчание дольше потолка — timeout.
 */
const runProbe = async (
  dependency: string,
  probe: () => Promise<unknown>,
): Promise<DependencyState> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  // Обработчик отказа вешается сразу: проба, отвалившаяся уже после потолка, иначе даёт
  // unhandled rejection и роняет процесс.
  const probeState: Promise<DependencyState> = Promise.resolve()
    .then(probe)
    .then(
      (): DependencyState => 'up',
      (error: unknown): DependencyState => {
        log.warn('Проверка зависимости отвалилась', { dependency, error: describeError(error) });
        return 'down';
      },
    );

  const timeoutState = new Promise<DependencyState>((resolve) => {
    timeoutId = setTimeout(() => {
      log.warn('Зависимость не ответила в отведённый потолок', {
        dependency,
        error: `нет ответа за ${DEPENDENCY_TIMEOUT_MS} мс`,
      });
      resolve('timeout');
    }, DEPENDENCY_TIMEOUT_MS);
  });

  try {
    return await Promise.race([probeState, timeoutState]);
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * Redis проверяется по уже существующему соединению очереди, отдельное под пробу не поднимается.
 * Оборванное соединение отдаётся как down сразу: клиент очереди копит команды бесконечно
 * (maxRetriesPerRequest: null), и слепой ping на мёртвом Redis упёрся бы в потолок и соврал
 * timeout. Соединение на подъёме — не отказ: первая проба после старта застаёт его именно
 * таким, поэтому ждём готовности под тем же потолком.
 */
const DEAD_CONNECTION_STATES = new Set(['end', 'close', 'wait']);

const waitForReady = (connection: Redis, timeoutMs: number): Promise<void> =>
  new Promise((resolve, reject) => {
    if (connection.status === 'ready') {
      resolve();
      return;
    }

    // Слушатель снимается по таймауту, а не остаётся висеть: проба ходит на каждый запрос
    // готовности, и брошенные подписки копятся на долгоживущем соединении.
    const onReady = (): void => {
      clearTimeout(timer);
      resolve();
    };

    const timer = setTimeout(() => {
      connection.off('ready', onReady);
      reject(new Error(`соединение не поднялось за ${timeoutMs} мс`));
    }, timeoutMs);

    connection.once('ready', onReady);
  });

const checkRedis = async (): Promise<DependencyState> => {
  try {
    const connection = getQueueConnection();

    if (DEAD_CONNECTION_STATES.has(connection.status)) {
      log.warn('Соединение очереди оборвано', {
        dependency: 'redis',
        error: `статус соединения ${connection.status}`,
      });
      return 'down';
    }

    return await runProbe('redis', async () => {
      await waitForReady(connection, DEPENDENCY_TIMEOUT_MS);
      return connection.ping();
    });
  } catch (error) {
    log.warn('Соединение очереди недоступно', { dependency: 'redis', error: describeError(error) });
    return 'down';
  }
};

export const checkDependencies = async (): Promise<ReadinessChecks> => {
  const [postgres, redis] = await Promise.all([
    runProbe('postgres', pingDatabase),
    checkRedis(),
  ]);

  return { postgres, redis };
};
