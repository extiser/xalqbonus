/**
 * Живой сбор транзакций парка (issue #358), по образцу `syncOrders`: окно по `event_at`
 * от своей отметки, строка в `xb.sync_runs`, отметка по верхней границе окна — только после
 * успеха. Упавший прогон отметку не трогает, и окно перечитается целиком следующим.
 *
 * Окно строится тем же устройством, что у заказов (`buildSlidingWindow`), со своими
 * настройками `SYNC_TRANSACTIONS_*`. Перекрытие безопасно: повтор транзакции снимается
 * ключом `id`. Первый прогон без отметки начинает от «сейчас» минус перекрытие: прошлое
 * догоняет прогон истории, а не живой сбор.
 *
 * Журнал суток `fleet_transaction_days` здесь не трогается — это журнал истории. Баллов,
 * `trips` и `sync_skips` сбор транзакций не касается.
 */
import { consola } from 'consola';

import { createFleetClient, type FleetTransport } from '#server/adapters/fleet/client';
import { readTransactionsByEventAt, type TransactionsWindow } from '#server/adapters/fleet/transactions';
import { upsertFleetTransactions } from '#server/repositories/fleetTransactions';
import { finishSyncRun, startSyncRun } from '#server/repositories/syncRuns';
import { readSyncState, setSyncWatermark } from '#server/repositories/syncState';
import { reportPageProblems, toTransactionInput } from '#server/services/fleetTransactions/transactionPages';
import { buildSlidingWindow } from '#server/services/sync/buildOrdersWindow';
import {
  readSyncConfig,
  readTransactionsSyncConfig,
  staleThresholdFromIntervalMs,
  transactionsIntervalMs,
} from '#server/services/sync/config';

const log = consola.withTag('sync:transactions');

const KIND = 'transactions';

export type TransactionsSyncSummary = {
  status: 'succeeded' | 'skipped';
  /** Пусто, если прогон не заводился: окно оказалось пустым. */
  runId: string | null;
  window: TransactionsWindow | null;
  pages: number;
  requests: number;
  rateLimited: number;
  /** Сколько транзакций вернул API — до разбора. */
  transactionsSeen: number;
  /** Сколько строк тронуто: вставленные плюс обновлённые. */
  transactionsWritten: number;
  malformed: number;
  /** Записанных без `created_by.identity` или `currency_code`. */
  incomplete: number;
};

export type RunTransactionsSyncOptions = {
  /** Подставляется тестами. По умолчанию — настоящий клиент Fleet API. */
  client?: FleetTransport;
  now?: Date;
};

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const runTransactionsSync = async (
  options: RunTransactionsSyncOptions = {},
): Promise<TransactionsSyncSummary> => {
  const config = readTransactionsSyncConfig();
  const now = options.now ?? new Date();
  const state = await readSyncState(KIND);
  const watermark = state?.watermark ?? null;
  const slidingWindow = buildSlidingWindow({
    watermark,
    now,
    overlapMinutes: config.overlapMinutes,
    lagSeconds: config.lagSeconds,
    maxWindowMinutes: config.maxWindowMinutes,
  });

  if (slidingWindow === null) {
    log.info('Окно пусто, прогон не заводится', { watermark });

    return {
      status: 'skipped',
      runId: null,
      window: null,
      pages: 0,
      requests: 0,
      rateLimited: 0,
      transactionsSeen: 0,
      transactionsWritten: 0,
      malformed: 0,
      incomplete: 0,
    };
  }

  const window: TransactionsWindow = { eventFrom: slidingWindow.from, eventTo: slidingWindow.to };

  if (watermark === null) {
    log.warn('Отметки ещё нет — прогон берёт только окно перекрытия. Прошлое закрывает прогон истории', {
      eventFrom: window.eventFrom.toISOString(),
    });
  } else {
    // Отметка, стоящая дольше трёх интервалов, — признак того, что падает каждый прогон.
    const lagMs = now.getTime() - watermark.getTime();
    const thresholdMs = staleThresholdFromIntervalMs(transactionsIntervalMs(KIND, config), readSyncConfig());

    if (lagMs > thresholdMs) {
      log.warn('Отметка сбора транзакций отстала — окно не движется, а прогоны идут', {
        watermark: watermark.toISOString(),
        lagMinutes: Math.round(lagMs / 60_000),
        thresholdMinutes: Math.round(thresholdMs / 60_000),
      });
    }
  }

  // Клиент собирается до строки прогона: незаполненные реквизиты в окружении — это отказ
  // на старте, а не прогон, навсегда оставшийся в состоянии `running`.
  const client =
    options.client ??
    createFleetClient({
      onRateLimited: (description, attempt, waitMs) => {
        log.warn('Отказ по лимиту Fleet API', { kind: KIND, description, attempt, waitMs });
      },
    });

  const runId = await startSyncRun(KIND, window.eventFrom, window.eventTo);

  let pages = 0;
  let transactionsSeen = 0;
  let transactionsWritten = 0;
  let malformed = 0;
  let incomplete = 0;

  try {
    for await (const page of readTransactionsByEventAt(client, window)) {
      pages += 1;
      transactionsSeen += page.received;
      malformed += page.malformed;
      incomplete += page.incomplete.length;
      reportPageProblems(log, page, { kind: KIND, runId, page: pages });

      transactionsWritten += await upsertFleetTransactions(page.transactions.map(toTransactionInput));
    }
  } catch (error) {
    const stats = client.stats();

    await finishSyncRun(
      runId,
      'failed',
      {
        requests: stats.requests,
        rateLimited: stats.rateLimited,
        itemsSeen: transactionsSeen,
        itemsWritten: transactionsWritten,
      },
      describeError(error),
    );

    // Отметка не трогается намеренно: окно будет перечитано целиком следующим прогоном.
    log.error('Прогон сбора транзакций упал, отметка осталась на месте', {
      runId,
      pages,
      transactionsSeen,
      transactionsWritten,
      requests: stats.requests,
      rateLimited: stats.rateLimited,
      error: describeError(error),
    });

    throw error;
  }

  const stats = client.stats();

  await finishSyncRun(
    runId,
    'succeeded',
    {
      requests: stats.requests,
      rateLimited: stats.rateLimited,
      itemsSeen: transactionsSeen,
      itemsWritten: transactionsWritten,
    },
    null,
  );

  // Только после успеха и только по верхней границе окна.
  await setSyncWatermark(KIND, window.eventTo, runId);

  const summary: TransactionsSyncSummary = {
    status: 'succeeded',
    runId,
    window,
    pages,
    requests: stats.requests,
    rateLimited: stats.rateLimited,
    transactionsSeen,
    transactionsWritten,
    malformed,
    incomplete,
  };

  log.info('Прогон сбора транзакций завершён', {
    runId,
    eventFrom: window.eventFrom.toISOString(),
    eventTo: window.eventTo.toISOString(),
    pages,
    requests: stats.requests,
    rateLimited: stats.rateLimited,
    transactionsSeen,
    transactionsWritten,
    malformed,
    incomplete,
  });

  return summary;
};
