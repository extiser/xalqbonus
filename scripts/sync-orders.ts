/**
 * Разовый прогон синхронизации заказов, мимо очереди.
 *
 * Тонкая обвязка над сервисом: разбор аргумента, вызов, сводка. Тем же кодом ходит
 * повторяющаяся задача воркера — второй реализации прогона не существует
 * (docs/principles.md → «Слои и зависимости»).
 *
 * Нужен, чтобы прогон можно было запустить руками и посмотреть на него целиком:
 * при обкатке, при разборе расхождения, при проверке, что повтор того же окна
 * не меняет ни одного баланса. Выключатель `SYNC_LIVE_ENABLED` на него не влияет —
 * он снимает расписание, а не запрещает синхронизацию.
 *
 * Запуск: make sync-orders            — скользящее окно
 *         make sync-orders kind=orders_catchup — догоняющий: тот же запуск, что делает
 *           расписание, — продолжает проход кусками или начинает новый, если пора
 */
import { consola } from 'consola';

import { db } from '#server/db';
import type { OrdersSyncKind } from '#server/services/sync/config';
import { runOrdersSync, type OrdersSyncSummary } from '#server/services/sync/syncOrders';
import { runOrdersCatchup } from '#server/services/sync/syncOrdersCatchup';

const log = consola.withTag('sync-orders');

const readKind = (): OrdersSyncKind => {
  const requested = process.argv[2] ?? 'orders';

  if (requested !== 'orders' && requested !== 'orders_catchup') {
    throw new Error(`вид прогона может быть orders или orders_catchup, получено «${requested}»`);
  }

  return requested;
};

const logSummary = (summary: OrdersSyncSummary): void => {
  log.info('Сводка прогона', {
    kind: summary.kind,
    runId: summary.runId,
    endedFrom: summary.window?.endedFrom.toISOString(),
    endedTo: summary.window?.endedTo.toISOString(),
    pages: summary.pages,
    requests: summary.requests,
    rateLimited: summary.rateLimited,
    ordersSeen: summary.ordersSeen,
    ordersWritten: summary.ordersWritten,
    ordersInserted: summary.ordersInserted,
    ordersUpdated: summary.ordersUpdated,
    malformed: summary.malformed,
    malformedIds: summary.malformedIds,
    skippedUnknownProfile: summary.skippedUnknownProfile,
    unknownProfiles: summary.unknownProfiles,
    unknownProfileIds: summary.unknownProfileIds,
    unknownValues: summary.unknownValues,
    accrual: summary.accrual,
  });
};

const main = async (): Promise<void> => {
  if (readKind() === 'orders_catchup') {
    const catchup = await runOrdersCatchup();

    if (catchup.status === 'waiting') {
      log.info('Проход пройден, следующему рано — прогонов не было');
      return;
    }

    catchup.slices.forEach(logSummary);
    return;
  }

  const summary = await runOrdersSync();

  if (summary.status === 'skipped') {
    log.info('Прогон не заводился: окно пусто');
    return;
  }

  logSummary(summary);
};

main()
  .catch((error: unknown) => {
    consola.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
