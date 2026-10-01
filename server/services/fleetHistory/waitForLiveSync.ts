/**
 * Охрана живой синхронизации для сборщика истории (issue #317).
 *
 * История ходит тем же ключом парка, которым каждую минуту ходит живая синхронизация,
 * и уступает ей. Перед каждой страницей смотрится журнал прогонов:
 *
 *   - идёт `orders_catchup` — ждать, проверяя раз в минуту: догоняющий проход — самое
 *     тяжёлое время на ключе;
 *   - за последние 15 минут упало два и больше прогонов `orders` — пауза `cooldown`.
 *     После паузы журнал смотрится заново: если отказы ещё в окне, пауза повторяется.
 *
 * Каждое ожидание — строка в лог с причиной.
 */
import { consola } from 'consola';

import { readLiveSyncPressure } from '#server/repositories/syncRuns';
import { sleepUnlessStopped } from '#server/services/fleetHistory/runControl';

const log = consola.withTag('fleet-history');

const CATCHUP_RECHECK_MS = 60_000;

const FAILED_ORDERS_WINDOW_MS = 15 * 60_000;

const FAILED_ORDERS_TO_COOL_DOWN = 2;

/** Сколько ждали за один вызов, по причинам. */
export type LiveSyncWaits = {
  catchupMs: number;
  failedOrdersMs: number;
};

export const waitForLiveSync = async (
  cooldownMs: number,
  signal: AbortSignal,
): Promise<LiveSyncWaits> => {
  const waits: LiveSyncWaits = { catchupMs: 0, failedOrdersMs: 0 };

  for (;;) {
    const pressure = await readLiveSyncPressure(new Date(Date.now() - FAILED_ORDERS_WINDOW_MS));

    if (pressure.catchupStartedAt !== null) {
      log.info('Ждём: идёт догоняющий прогон orders_catchup', {
        catchupStartedAt: pressure.catchupStartedAt.toISOString(),
        recheckSec: CATCHUP_RECHECK_MS / 1_000,
      });
      await sleepUnlessStopped(CATCHUP_RECHECK_MS, signal);
      waits.catchupMs += CATCHUP_RECHECK_MS;
      continue;
    }

    if (pressure.ordersFailedRecently >= FAILED_ORDERS_TO_COOL_DOWN) {
      log.warn('Ждём: живая синхронизация orders падает', {
        failedLast15Min: pressure.ordersFailedRecently,
        cooldownMin: cooldownMs / 60_000,
      });
      await sleepUnlessStopped(cooldownMs, signal);
      waits.failedOrdersMs += cooldownMs;
      continue;
    }

    return waits;
  }
};
