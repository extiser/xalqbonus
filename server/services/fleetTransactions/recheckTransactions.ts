/**
 * Ночное перечитывание транзакций (issue #358), вид прогона `transactions_recheck`.
 *
 * Последние `SYNC_TRANSACTIONS_RECHECK_DAYS` закрытых суток UTC, включая вчерашние, проходятся
 * заново с первой страницы. Появляются ли транзакции задним числом, с `event_at` в прошлом,
 * не проверено — перечитывание страхует от того, что живое окно их не увидит. Повтор уже
 * записанной транзакции снимается ключом `id`.
 *
 * В начале — справочник категорий. По каждым суткам в лог — сколько транзакций с `event_at`
 * в этих сутках было в таблице до прохода и стало после.
 *
 * Отметки нет: окно задаётся часами, а не прошлым прогоном. Журнал суток `fleet_transaction_days`
 * не трогается — он принадлежит прогону истории, и повтор закрытых суток переписал бы его итоги.
 */
import { consola } from 'consola';

import { createFleetClient, type FleetTransport } from '#server/adapters/fleet/client';
import { readTransactionsByEventAt } from '#server/adapters/fleet/transactions';
import { countFleetTransactionsBetween, upsertFleetTransactions } from '#server/repositories/fleetTransactions';
import { finishSyncRun, startSyncRun } from '#server/repositories/syncRuns';
import { refreshTransactionCategories } from '#server/services/fleetTransactions/refreshTransactionCategories';
import {
  createUnknownCategoryNotice,
  reportPageProblems,
  toTransactionInput,
} from '#server/services/fleetTransactions/transactionPages';
import { readTransactionsSyncConfig } from '#server/services/sync/config';

const log = consola.withTag('sync:transactions-recheck');

const KIND = 'transactions_recheck';

const DAY_MS = 86_400_000;

export type RecheckDaySummary = {
  /** Сутки сбора по UTC, `YYYY-MM-DD`. */
  parkDay: string;
  /** Транзакций с `event_at` в сутках в таблице до прохода. */
  before: number;
  /** То же после прохода. */
  after: number;
  pages: number;
  seen: number;
};

export type TransactionsRecheckSummary = {
  runId: string;
  days: RecheckDaySummary[];
  categories: number;
  requests: number;
  rateLimited: number;
  transactionsSeen: number;
  transactionsWritten: number;
  malformed: number;
  incomplete: number;
};

export type RunTransactionsRecheckOptions = {
  /** Подставляется тестами. По умолчанию — настоящий клиент Fleet API. */
  client?: FleetTransport;
  now?: Date;
};

/** Последние `count` закрытых суток UTC до `now`, от старых к новым: вчерашние — последние. */
export const listRecheckDays = (now: Date, count: number): Date[] => {
  const today = Math.floor(now.getTime() / DAY_MS) * DAY_MS;

  return Array.from({ length: count }, (_, index) => new Date(today - (count - index) * DAY_MS));
};

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const runTransactionsRecheck = async (
  options: RunTransactionsRecheckOptions = {},
): Promise<TransactionsRecheckSummary> => {
  const config = readTransactionsSyncConfig();
  const days = listRecheckDays(options.now ?? new Date(), config.recheckDays);
  const firstDay = days[0];
  const lastDay = days[days.length - 1];

  if (firstDay === undefined || lastDay === undefined) {
    throw new Error('перечитывать нечего: SYNC_TRANSACTIONS_RECHECK_DAYS пуст');
  }

  const client =
    options.client ??
    createFleetClient({
      onRateLimited: (description, attempt, waitMs) => {
        log.warn('Отказ по лимиту Fleet API', { kind: KIND, description, attempt, waitMs });
      },
    });

  const runId = await startSyncRun(KIND, firstDay, new Date(lastDay.getTime() + DAY_MS));

  const summaries: RecheckDaySummary[] = [];
  let categories = 0;
  let transactionsSeen = 0;
  let transactionsWritten = 0;
  let malformed = 0;
  let incomplete = 0;

  try {
    const refresh = await refreshTransactionCategories(client, log);
    categories = refresh.known.size;
    const onTransactions = createUnknownCategoryNotice(log, refresh.known);

    for (const day of days) {
      const parkDay = day.toISOString().slice(0, 10);
      const window = { eventFrom: day, eventTo: new Date(day.getTime() + DAY_MS) };
      const before = await countFleetTransactionsBetween(window.eventFrom, window.eventTo);
      let pages = 0;
      let seen = 0;

      for await (const page of readTransactionsByEventAt(client, window)) {
        pages += 1;
        seen += page.received;
        malformed += page.malformed;
        incomplete += page.incomplete.length;
        reportPageProblems(log, page, { kind: KIND, runId, parkDay, page: pages });
        onTransactions(page.transactions);

        transactionsWritten += await upsertFleetTransactions(page.transactions.map(toTransactionInput));
      }

      transactionsSeen += seen;
      const after = await countFleetTransactionsBetween(window.eventFrom, window.eventTo);
      const summary = { parkDay, before, after, pages, seen };
      summaries.push(summary);

      log.info('Сутки перечитаны: было / стало', { ...summary, added: after - before });
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

    log.error('Перечитывание транзакций упало', {
      runId,
      daysDone: summaries.length,
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

  const result: TransactionsRecheckSummary = {
    runId,
    days: summaries,
    categories,
    requests: stats.requests,
    rateLimited: stats.rateLimited,
    transactionsSeen,
    transactionsWritten,
    malformed,
    incomplete,
  };

  log.info('Перечитывание транзакций завершено', {
    runId,
    from: firstDay.toISOString(),
    to: new Date(lastDay.getTime() + DAY_MS).toISOString(),
    days: summaries.length,
    requests: stats.requests,
    rateLimited: stats.rateLimited,
    transactionsSeen,
    transactionsWritten,
    malformed,
    incomplete,
  });

  return result;
};
