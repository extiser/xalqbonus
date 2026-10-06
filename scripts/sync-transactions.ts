/**
 * Разовый прогон сбора транзакций, мимо очереди (issue #358).
 *
 * Тонкая обвязка над сервисом: тем же кодом ходит повторяющаяся задача воркера. Выключатели
 * `SYNC_TRANSACTIONS_ENABLED` и `SYNC_TRANSACTIONS_RECHECK_ENABLED` на него не влияют — они
 * снимают расписание, а не запрещают сбор.
 *
 * Запуск: make sync-transactions          — живой сбор: окно от отметки
 *         make sync-transactions-recheck  — перечитывание последних суток
 */
import { consola } from 'consola';

import { db } from '#server/db';
import { runTransactionsRecheck } from '#server/services/fleetTransactions/recheckTransactions';
import { runTransactionsSync } from '#server/services/fleetTransactions/syncTransactions';

const log = consola.withTag('sync-transactions');

const main = async (): Promise<void> => {
  const kind = process.argv[2] ?? 'transactions';

  if (kind === 'transactions_recheck') {
    const summary = await runTransactionsRecheck();

    log.info('Сводка перечитывания', summary);
    return;
  }

  if (kind !== 'transactions') {
    throw new Error(`вид прогона может быть transactions или transactions_recheck, получено «${kind}»`);
  }

  const summary = await runTransactionsSync();

  if (summary.status === 'skipped') {
    log.info('Прогон не заводился: окно пусто');
    return;
  }

  log.info('Сводка прогона', {
    runId: summary.runId,
    eventFrom: summary.window?.eventFrom.toISOString(),
    eventTo: summary.window?.eventTo.toISOString(),
    pages: summary.pages,
    requests: summary.requests,
    rateLimited: summary.rateLimited,
    transactionsSeen: summary.transactionsSeen,
    transactionsWritten: summary.transactionsWritten,
    malformed: summary.malformed,
    incomplete: summary.incomplete,
  });
};

main()
  .catch((error: unknown) => {
    consola.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
