import type { SyncRunRow, SyncSkipRow } from '#shared/types/sync';

/**
 * Подписи словарей на экране.
 *
 * Живут одним местом, а не строками в разметке: вид прогона называется в четырёх блоках
 * экрана, и четыре независимых перевода одного и того же слова разойдутся.
 */

const RUN_KIND_LABELS: Record<SyncRunRow['kind'], string> = {
  orders: 'Заказы',
  orders_catchup: 'Заказы, догоняющий',
  registry: 'Реестр',
  registry_full: 'Реестр, полный обход',
};

export const runKindLabel = (kind: SyncRunRow['kind']): string => RUN_KIND_LABELS[kind];

const RUN_STATUS_LABELS: Record<SyncRunRow['status'], string> = {
  running: 'идёт',
  succeeded: 'успех',
  failed: 'отказ',
};

export const runStatusLabel = (status: SyncRunRow['status']): string => RUN_STATUS_LABELS[status];

const SKIP_REASON_LABELS: Record<SyncSkipRow['reason'], string> = {
  unknown_profile: 'водителя нет в реестре',
  malformed: 'не хватило поля',
  unknown_value: 'незнакомое значение словаря',
  license_conflict: 'номер ВУ занят другим человеком',
};

export const skipReasonLabel = (reason: SyncSkipRow['reason']): string =>
  SKIP_REASON_LABELS[reason];
