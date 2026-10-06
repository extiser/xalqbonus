/**
 * Обновление справочника категорий транзакций (issue #358).
 *
 * Зовётся в начале каждого прогона истории и каждого ночного перечитывания. В лог — число
 * категорий по группам; наружу — все известные справочнику категории, по ним прогон замечает
 * транзакции с категорией, которой справочник ещё не знает.
 */
import type { ConsolaInstance } from 'consola';

import type { FleetTransport } from '#server/adapters/fleet/client';
import { readTransactionCategories } from '#server/adapters/fleet/transactions';
import {
  readFleetTransactionCategoryIds,
  saveFleetTransactionCategories,
} from '#server/repositories/fleetTransactions';

export type CategoriesRefresh = {
  /** Сколько категорий пришло в ответе и легло в справочник. */
  received: number;
  /** Категорий в справочнике после обновления: пропавшие из ответа остаются. */
  known: ReadonlySet<string>;
};

export const refreshTransactionCategories = async (
  client: FleetTransport,
  log: ConsolaInstance,
): Promise<CategoriesRefresh> => {
  const { categories, skipped } = await readTransactionCategories(client);

  await saveFleetTransactionCategories(categories, new Date());

  const byGroup: Record<string, number> = {};

  for (const category of categories) {
    byGroup[category.groupId] = (byGroup[category.groupId] ?? 0) + 1;
  }

  const known = await readFleetTransactionCategoryIds();

  log.info('Справочник категорий обновлён', {
    received: categories.length,
    known: known.size,
    byGroup,
    ...(skipped > 0 ? { skippedWithoutRequiredField: skipped } : {}),
  });

  return { received: categories.length, known };
};
