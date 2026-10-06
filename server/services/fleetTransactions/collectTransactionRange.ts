/**
 * Прогон истории транзакций парка по диапазону суток (issue #358), по образцу
 * `collectHistoryRange.ts` истории заказов — с теми же правилами:
 *
 *   - в начале — справочник категорий; его запрос идёт в бюджет запуска;
 *   - сутки идут от `from` к `to`: пока Fleet отдаёт транзакции, первыми пропадают самые старые;
 *   - сутки, закрытые в журнале, пропускаются без запроса к Fleet — повтор той же команды
 *     добирает незакрытое; пустые сутки закрываются нулями;
 *   - между страницами — пауза `pause`, клиент Fleet создаётся заново на каждые сутки:
 *     пауза клиента, выросшая после 429, назад не отыгрывается;
 *   - перед каждой страницей — охрана живой синхронизации (`waitForLiveSync.ts`);
 *   - два 429 подряд обрывают сутки — пауза `cooldown`, сутки продолжаются с курсора.
 *     Трижды оборванные сутки остаются незакрытыми, прогон идёт дальше;
 *   - кончился бюджет или пришёл сигнал — штатная остановка с итогом.
 *
 * Отказ, не похожий ни на лимит, ни на бюджет, ни на сигнал, роняет прогон: молча идти
 * дальше мимо него значит копить дыры.
 *
 * Общие части — бюджет, остановка по сигналу, охрана — импортируются из `fleetHistory`.
 */
import { consola } from 'consola';

import type { FleetTransport } from '#server/adapters/fleet/client';
import { readFleetTransactionCategoryIds, readFleetTransactionDayClosed } from '#server/repositories/fleetTransactions';
import { parseParkDay, RepeatedRateLimitError } from '#server/services/fleetHistory/collectHistoryDay';
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
import {
  collectTransactionDay,
  TransactionDayStoppedError,
} from '#server/services/fleetTransactions/collectTransactionDay';
import { refreshTransactionCategories } from '#server/services/fleetTransactions/refreshTransactionCategories';
import { createUnknownCategoryNotice } from '#server/services/fleetTransactions/transactionPages';

const log = consola.withTag('fleet-transactions');

const DAY_MS = 86_400_000;

/** Столько раз подряд сутки обрываются лимитом, прежде чем прогон оставит их и пойдёт дальше. */
const ATTEMPTS_PER_DAY = 3;

export type TransactionRangeOptions = {
  from: string;
  to: string;
  /** Потолок запросов на запуск, вместе с запросом справочника. */
  budget: number;
  /** Пауза между страницами, от конца одного запроса до начала следующего. */
  pauseMs: number;
  /** Пауза после оборванных лимитом суток и при падающей живой синхронизации. */
  cooldownMs: number;
  /** Новый клиент Fleet: зовётся на справочник и на каждую попытку суток. */
  createClient: () => FleetTransport;
  signal: AbortSignal;
};

export type TransactionRangeStop = 'finished' | 'budget' | 'signal';

export type TransactionRangeSummary = {
  stoppedBy: TransactionRangeStop;
  /** Категорий в справочнике после обновления. */
  categories: number;
  /** Обновился ли справочник этим запуском: два 429 подряд на нём прогон не роняют. */
  categoriesRefreshed: boolean;
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
  transactionsWritten: number;
  /** Записанных без `created_by.identity` или `currency_code`. */
  transactionsIncomplete: number;
};

/** Прогон упал отказом, который не пережидается. Итог до места падения — в `summary`. */
export class TransactionRangeFailedError extends Error {
  constructor(
    public readonly summary: TransactionRangeSummary,
    cause: unknown,
  ) {
    super(`прогон истории транзакций упал: ${cause instanceof Error ? cause.message : 'неизвестный отказ'}`, {
      cause,
    });
    this.name = 'TransactionRangeFailedError';
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

const toStop = (cause: unknown): TransactionRangeStop | null => {
  if (cause instanceof RequestBudgetExhaustedError) {
    return 'budget';
  }

  if (cause instanceof StopRequestedError) {
    return 'signal';
  }

  return null;
};

export const collectTransactionRange = async (
  options: TransactionRangeOptions,
): Promise<TransactionRangeSummary> => {
  const { pauseMs, cooldownMs, signal } = options;
  const days = listParkDays(options.from, options.to);
  const budget = createRequestBudget(options.budget);

  const summary: TransactionRangeSummary = {
    stoppedBy: 'finished',
    categories: 0,
    categoriesRefreshed: false,
    daysCollected: 0,
    daysSkippedClosed: 0,
    daysLeftOpen: [],
    daysNotReached: 0,
    requests: 0,
    rateLimited: 0,
    waitedCatchupMs: 0,
    waitedFailedOrdersMs: 0,
    waitedRateLimitCooldownMs: 0,
    transactionsWritten: 0,
    transactionsIncomplete: 0,
  };

  const refreshCounters = (): TransactionRangeSummary => {
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

  const stopAt = (index: number, stoppedBy: TransactionRangeStop, parkDay: string): TransactionRangeSummary => {
    summary.stoppedBy = stoppedBy;
    summary.daysLeftOpen.push(parkDay);
    summary.daysNotReached = days.length - index - 1;
    return refreshCounters();
  };

  try {
    let knownCategoryIds: ReadonlySet<string>;

    try {
      const refresh = await refreshTransactionCategories(createDayTransport(), log);
      knownCategoryIds = refresh.known;
      summary.categoriesRefreshed = true;
    } catch (error) {
      const stoppedBy = toStop(error);

      if (stoppedBy !== null) {
        log.warn('Прогон остановлен до первых суток', { reason: error instanceof Error ? error.message : String(error) });
        summary.stoppedBy = stoppedBy;
        summary.daysNotReached = days.length;
        return refreshCounters();
      }

      // Справочник — подпись к транзакциям, а не их условие: два 429 на нём не повод
      // бросать прогон истории на часы вперёд. Сравнение идёт с тем, что в таблице.
      if (!(error instanceof RepeatedRateLimitError)) {
        throw error;
      }

      log.warn('Справочник категорий не обновлён: лимит не отпустил, прогон идёт со старым', {
        reason: error.message,
      });
      knownCategoryIds = await readFleetTransactionCategoryIds();
    }

    summary.categories = knownCategoryIds.size;
    const onTransactions = createUnknownCategoryNotice(log, knownCategoryIds);

    for (const [index, parkDay] of days.entries()) {
      if (signal.aborted) {
        summary.stoppedBy = 'signal';
        summary.daysNotReached = days.length - index;
        return refreshCounters();
      }

      if ((await readFleetTransactionDayClosed(parseParkDay(parkDay))) === true) {
        summary.daysSkippedClosed += 1;
        continue;
      }

      for (let attempt = 1; attempt <= ATTEMPTS_PER_DAY; attempt += 1) {
        try {
          const started = Date.now();
          const day = await collectTransactionDay(createDayTransport(), parkDay, { onTransactions });

          summary.daysCollected += 1;
          summary.transactionsWritten += day.written;
          summary.transactionsIncomplete += day.incomplete;

          log.info('Сутки закрыты', {
            parkDay,
            transactions: day.transactions,
            malformed: day.malformed,
            incomplete: day.incomplete,
            pages: day.pages,
            rateLimited: day.rateLimited,
            written: day.written,
            durationSec: Math.round((Date.now() - started) / 1_000),
            requestsSoFar: refreshCounters().requests,
          });
          break;
        } catch (error) {
          if (!(error instanceof TransactionDayStoppedError)) {
            throw error;
          }

          summary.transactionsWritten += error.written;
          summary.transactionsIncomplete += error.incomplete;

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
    throw new TransactionRangeFailedError(refreshCounters(), error);
  }

  return refreshCounters();
};
