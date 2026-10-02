/**
 * Полный прогон истории заказов парка по диапазону суток (issue #317).
 *
 * Сутки идут от `from` к `to`: окно хранения у Fleet, по гипотезе пробы, скользящее,
 * и первыми пропадают самые старые сутки (_reference/fleet-api/history-depth-2026-10.md).
 * Прогон идёт часами на ключе живой синхронизации, поэтому:
 *
 *   - сутки, закрытые в журнале, пропускаются без запроса к Fleet — повтор той же команды
 *     добирает незакрытое;
 *   - пустые сутки закрываются нулями, и прогон идёт дальше;
 *   - между страницами выдерживается пауза `pause`, а клиент Fleet создаётся заново
 *     на каждые сутки: пауза клиента, выросшая после 429, назад не отыгрывается;
 *   - перед каждой страницей — охрана живой синхронизации (`waitForLiveSync.ts`);
 *   - два 429 подряд обрывают сутки — пауза `cooldown`, и сутки продолжаются с курсора
 *     последней записанной страницы (issue #328). Трижды оборванные сутки остаются
 *     незакрытыми, прогон идёт дальше; следующий запуск продолжит и их. Пауза выдерживается
 *     и после третьего обрыва: следующие сутки иначе упёрлись бы в тот же лимит;
 *   - кончился бюджет или пришёл сигнал — штатная остановка с итогом.
 *
 * Отказ, не похожий ни на лимит, ни на бюджет, ни на сигнал, — сеть после всех попыток,
 * ответ API, база — роняет прогон: молча идти дальше мимо него значит копить дыры.
 */
import { consola } from 'consola';

import type { FleetTransport } from '#server/adapters/fleet/client';
import { readFleetOrderHistoryDayClosed } from '#server/repositories/fleetOrderHistory';
import {
  collectHistoryDay,
  HistoryDayStoppedError,
  parseParkDay,
  RepeatedRateLimitError,
} from '#server/services/fleetHistory/collectHistoryDay';
import {
  createRequestBudget,
  RequestBudgetExhaustedError,
} from '#server/services/fleetHistory/requestBudget';
import {
  sleepUnlessStopped,
  StopRequestedError,
  throwIfStopped,
} from '#server/services/fleetHistory/runControl';
import { waitForLiveSync } from '#server/services/fleetHistory/waitForLiveSync';

const log = consola.withTag('fleet-history');

const DAY_MS = 86_400_000;

/** Столько раз подряд сутки обрываются лимитом, прежде чем прогон оставит их и пойдёт дальше. */
const ATTEMPTS_PER_DAY = 3;

export type HistoryRangeOptions = {
  from: string;
  to: string;
  /** Потолок запросов на запуск. */
  budget: number;
  /** Пауза между страницами, от конца одного запроса до начала следующего. */
  pauseMs: number;
  /** Пауза после оборванных лимитом суток и при падающей живой синхронизации. */
  cooldownMs: number;
  /** Новый клиент Fleet: зовётся на каждую попытку суток. */
  createClient: () => FleetTransport;
  signal: AbortSignal;
};

export type HistoryRangeStop = 'finished' | 'budget' | 'signal';

export type HistoryRangeSummary = {
  stoppedBy: HistoryRangeStop;
  /** Сутки, закрытые этим запуском. */
  daysCollected: number;
  /** Сутки, закрытые раньше: пропущены без запроса. */
  daysSkippedClosed: number;
  /** Сутки, начатые этим запуском и оставшиеся незакрытыми. */
  daysLeftOpen: string[];
  /** Сутки диапазона, до которых запуск не дошёл. */
  daysNotReached: number;
  requests: number;
  rateLimited: number;
  /** Ожидание охраны: идёт `orders_catchup`. */
  waitedCatchupMs: number;
  /** Ожидание охраны: падают прогоны `orders`. */
  waitedFailedOrdersMs: number;
  /** Пауза `cooldown` после суток, оборванных лимитом. */
  waitedRateLimitCooldownMs: number;
  ordersWritten: number;
};

/** Прогон упал отказом, который не пережидается. Итог до места падения — в `summary`. */
export class HistoryRangeFailedError extends Error {
  constructor(
    public readonly summary: HistoryRangeSummary,
    cause: unknown,
  ) {
    super(`прогон истории упал: ${cause instanceof Error ? cause.message : 'неизвестный отказ'}`, {
      cause,
    });
    this.name = 'HistoryRangeFailedError';
  }
}

const listParkDays = (from: string, to: string): string[] => {
  const first = parseParkDay(from);
  const last = parseParkDay(to);

  if (first.getTime() > last.getTime()) {
    throw new Error(`from (${from}) позже to (${to})`);
  }

  const days: string[] = [];

  for (let time = first.getTime(); time <= last.getTime(); time += DAY_MS) {
    days.push(new Date(time).toISOString().slice(0, 10));
  }

  return days;
};

const toStop = (cause: unknown): HistoryRangeStop | null => {
  if (cause instanceof RequestBudgetExhaustedError) {
    return 'budget';
  }

  if (cause instanceof StopRequestedError) {
    return 'signal';
  }

  return null;
};

export const collectHistoryRange = async (
  options: HistoryRangeOptions,
): Promise<HistoryRangeSummary> => {
  const { pauseMs, cooldownMs, signal } = options;
  const days = listParkDays(options.from, options.to);
  const budget = createRequestBudget(options.budget);

  const summary: HistoryRangeSummary = {
    stoppedBy: 'finished',
    daysCollected: 0,
    daysSkippedClosed: 0,
    daysLeftOpen: [],
    daysNotReached: 0,
    requests: 0,
    rateLimited: 0,
    waitedCatchupMs: 0,
    waitedFailedOrdersMs: 0,
    waitedRateLimitCooldownMs: 0,
    ordersWritten: 0,
  };

  const refreshCounters = (): HistoryRangeSummary => {
    const stats = budget.stats();
    summary.requests = stats.requests;
    summary.rateLimited = stats.rateLimited;
    return summary;
  };

  // Конец предыдущего запроса к Fleet за весь запуск, а не за сутки: пауза держится
  // и на стыке суток, где клиент новый и своей паузы ещё не знает.
  let lastRequestEndedAt: number | null = null;

  const beforePage = async (): Promise<void> => {
    throwIfStopped(signal);

    const waits = await waitForLiveSync(cooldownMs, signal);
    summary.waitedCatchupMs += waits.catchupMs;
    summary.waitedFailedOrdersMs += waits.failedOrdersMs;

    if (lastRequestEndedAt !== null) {
      const remaining = pauseMs - (Date.now() - lastRequestEndedAt);

      if (remaining > 0) {
        await sleepUnlessStopped(remaining, signal);
      }
    }
  };

  // Порядок обёрток: сначала бюджет, потом ожидания — исчерпанный бюджет не ждёт охраны
  // и паузы ради запроса, который всё равно не уйдёт.
  const createDayTransport = (): FleetTransport => {
    const client = options.createClient();

    const paced: FleetTransport = {
      parkId: client.parkId,
      stats: () => client.stats(),
      post: async (path, body, description) => {
        await beforePage();

        try {
          return await client.post(path, body, description);
        } finally {
          lastRequestEndedAt = Date.now();
        }
      },
      get: async (path, query, description) => {
        await beforePage();

        try {
          return await client.get(path, query, description);
        } finally {
          lastRequestEndedAt = Date.now();
        }
      },
    };

    return budget.wrap(paced);
  };

  const stopAt = (index: number, stoppedBy: HistoryRangeStop, parkDay: string): HistoryRangeSummary => {
    summary.stoppedBy = stoppedBy;
    summary.daysLeftOpen.push(parkDay);
    summary.daysNotReached = days.length - index - 1;
    return refreshCounters();
  };

  try {
    for (const [index, parkDay] of days.entries()) {
      if (signal.aborted) {
        summary.stoppedBy = 'signal';
        summary.daysNotReached = days.length - index;
        return refreshCounters();
      }

      if ((await readFleetOrderHistoryDayClosed(parseParkDay(parkDay))) === true) {
        summary.daysSkippedClosed += 1;
        continue;
      }

      for (let attempt = 1; attempt <= ATTEMPTS_PER_DAY; attempt += 1) {
        try {
          const started = Date.now();
          const day = await collectHistoryDay(createDayTransport(), parkDay);

          summary.daysCollected += 1;
          summary.ordersWritten += day.written;

          log.info('Сутки закрыты', {
            parkDay,
            orders: day.orders,
            complete: day.complete,
            malformed: day.malformed,
            pages: day.pages,
            rateLimited: day.rateLimited,
            written: day.written,
            durationSec: Math.round((Date.now() - started) / 1_000),
            requestsSoFar: refreshCounters().requests,
          });
          break;
        } catch (error) {
          if (!(error instanceof HistoryDayStoppedError)) {
            throw error;
          }

          summary.ordersWritten += error.written;

          const stoppedBy = toStop(error.cause);

          if (stoppedBy !== null) {
            log.warn('Прогон остановлен', { parkDay, reason: error.message });
            return stopAt(index, stoppedBy, parkDay);
          }

          if (!(error.cause instanceof RepeatedRateLimitError)) {
            throw error;
          }

          const givingUp = attempt === ATTEMPTS_PER_DAY;

          log.warn(givingUp ? 'Сутки оставлены незакрытыми' : 'Сутки оборваны лимитом, ждём и повторяем', {
            parkDay,
            attempt,
            reason: error.message,
            cooldownMin: cooldownMs / 60_000,
          });

          if (givingUp) {
            summary.daysLeftOpen.push(parkDay);
          }

          try {
            await sleepUnlessStopped(cooldownMs, signal);
          } catch (sleepError) {
            if (sleepError instanceof StopRequestedError) {
              // Оставленные сутки уже в списке незакрытых — второй раз их не добавляем.
              if (givingUp) {
                summary.daysLeftOpen.pop();
              }

              return stopAt(index, 'signal', parkDay);
            }

            throw sleepError;
          }

          summary.waitedRateLimitCooldownMs += cooldownMs;
        }
      }
    }
  } catch (error) {
    throw new HistoryRangeFailedError(refreshCounters(), error);
  }

  return refreshCounters();
};
