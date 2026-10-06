/**
 * Общее для всех трёх путей сбора транзакций — истории, живого сбора и перечитывания
 * (issue #358): перевод разобранной транзакции в строку репозитория и разбор того, что
 * со страницей было не так.
 */
import type { ConsolaInstance } from 'consola';

import type { FleetTransaction, TransactionsPage } from '#server/adapters/fleet/transactions';
import type { FleetTransactionInput } from '#server/repositories/fleetTransactions';

export const toTransactionInput = (transaction: FleetTransaction): FleetTransactionInput => ({
  id: transaction.id,
  eventAt: transaction.eventAt,
  categoryId: transaction.categoryId,
  amount: transaction.amount,
  currencyCode: transaction.currencyCode,
  driverProfileId: transaction.driverProfileId,
  orderId: transaction.orderId,
  externalEventId: transaction.externalEventId,
  description: transaction.description,
  createdBy: transaction.createdBy,
  createdByDispatcher: transaction.createdByDispatcher,
});

/**
 * Каждая транзакция, которую нельзя записать, и каждая, записанная без служебного поля, —
 * своей строкой в лог с `id`. Знать, что потеряно N транзакций, и не знать какие, — тот же
 * класс ошибки, что тишина. Персональных данных в строке нет: только идентификатор и поле.
 */
export const reportPageProblems = (
  log: ConsolaInstance,
  page: TransactionsPage,
  context: Record<string, unknown>,
): void => {
  for (const malformed of page.malformedIds) {
    log.warn('Транзакция не разобрана и не записана', {
      ...context,
      transactionId: malformed.transactionId,
      field: malformed.field,
    });
  }

  for (const incomplete of page.incomplete) {
    log.warn('Транзакция записана без служебного поля', {
      ...context,
      transactionId: incomplete.transactionId,
      missing: incomplete.fields,
    });
  }
};

/**
 * Замечает категории, которых нет в справочнике: каждую — один раз за прогон. Транзакция
 * с такой категорией пишется как есть: внешнего ключа на справочник нет.
 */
export const createUnknownCategoryNotice = (
  log: ConsolaInstance,
  knownCategoryIds: ReadonlySet<string>,
): ((transactions: readonly FleetTransaction[]) => void) => {
  const noticed = new Set<string>();

  return (transactions) => {
    for (const { categoryId } of transactions) {
      if (knownCategoryIds.has(categoryId) || noticed.has(categoryId)) {
        continue;
      }

      noticed.add(categoryId);
      log.warn('Категории нет в справочнике — транзакции записаны как есть', { categoryId });
    }
  };
};
