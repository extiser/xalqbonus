import { readSyncDataBoundaries, readSyncPeriodCounts } from '#server/repositories/syncSummary';
import type { SyncPeriodSummary, SyncSummaryResponse } from '#shared/types/sync';

/**
 * Свод синхронизации за сутки и за неделю.
 *
 * Каждое число — различные сущности из таблиц данных по времени события. Суммой счётчиков
 * прогонов свод не является и являться не может: счётчик прогона считает события этого
 * прогона, а перекрытие окон приносит один заказ в несколько прогонов подряд. Насколько
 * сумма разойдётся с числом заказов, зависит от ширины окна и интервала прогона, а не
 * от смысла — поэтому она не годится в свод и при близких числах тоже.
 *
 * Вместе со сводом отдаются границы, с которых у нас вообще есть данные: «за сутки»
 * на шестичасовой истории — неправда, и подпись периода обязана это сказать.
 */

const DAY_MS = 24 * 60 * 60 * 1_000;

const PERIODS: { period: SyncPeriodSummary['period']; days: number }[] = [
  { period: 'day', days: 1 },
  { period: 'week', days: 7 },
];

export const readSyncSummary = async (): Promise<SyncSummaryResponse> => {
  const now = new Date();

  const boundaries = await readSyncDataBoundaries();

  const periods = await Promise.all(
    PERIODS.map(async ({ period, days }): Promise<SyncPeriodSummary> => {
      const from = new Date(now.getTime() - days * DAY_MS);
      const counts = await readSyncPeriodCounts(from);

      return { period, from: from.toISOString(), ...counts };
    }),
  );

  return {
    now: now.toISOString(),
    journalSince: boundaries.journalSince?.toISOString() ?? null,
    tripsSince: boundaries.tripsSince?.toISOString() ?? null,
    periods,
  };
};
