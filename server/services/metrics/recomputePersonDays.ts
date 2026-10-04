import {
  failMetricRecomputeRun,
  replaceMetricPersonDays,
  startMetricRecomputeRun,
} from '#server/repositories/metrics';
import { METRICS_FIRST_DAY } from '#server/services/metrics/constants';
import { previousDayKey } from '#server/utils/parkTime';

/**
 * Ночной пересчёт готовой таблицы метрик `metric_person_days` (issue #371).
 *
 * Сутки — с первых суток истории Fleet по вчерашние включительно: сегодняшние ещё идут.
 * Таблица считается целиком заново, а прогон пишется в журнал: по нему экран говорит, когда
 * посчитано. Упавший прогон остаётся в журнале с текстом ошибки и уходит наверх исключением —
 * очередь пишет его в лог, а повторит следующая ночь.
 *
 * Тем же сервисом ходят очередь `metrics` и разовый `make metrics-recompute`.
 */

export type RecomputeSummary = {
  runId: string;
  daysFrom: string;
  daysTo: string;
  rows: number;
  unattributedOrders: number;
  durationMs: number;
};

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const recomputePersonDays = async (now: Date = new Date()): Promise<RecomputeSummary> => {
  const startedAt = Date.now();
  const daysFrom = METRICS_FIRST_DAY;
  const daysTo = previousDayKey(now);
  const runId = await startMetricRecomputeRun(daysFrom, daysTo);

  try {
    const result = await replaceMetricPersonDays(runId, daysFrom, daysTo);

    return { runId, daysFrom, daysTo, ...result, durationMs: Date.now() - startedAt };
  } catch (error) {
    await failMetricRecomputeRun(runId, describeError(error));
    throw error;
  }
};
