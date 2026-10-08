import {
  failMetricMoneyRun,
  replaceMetricMoneyDays,
  startMetricMoneyRun,
} from '#server/repositories/metrics';
import { MONEY_FIRST_DAY, PARK_FEE_CATEGORY_ID, PAYMENT_CATEGORY_IDS } from '#server/services/metrics/constants';
import { previousDayKey } from '#server/utils/parkTime';

/**
 * Пересчёт готовой таблицы денег `metric_money_days` (issue #438) — устроен как
 * `recomputePersonDays.ts`.
 *
 * Сутки — с первых суток денег по вчерашние по Ташкенту включительно: сегодняшние ещё идут.
 * Таблица считается целиком заново, прогон пишется в журнал: по нему экран говорит, когда
 * и по какие сутки посчитано. Упавший прогон остаётся в журнале с текстом ошибки и уходит
 * наверх исключением.
 *
 * Запускается не по часам, а после ночного перечитывания транзакций (`server/queues/worker.ts`):
 * опоздавшие транзакции должны попасть в цифру (docs/decisions.md → «Деньги на дашборде»).
 * Тем же сервисом ходит разовый `make metrics-recompute`.
 */

export type MoneyRecomputeSummary = {
  runId: string;
  daysFrom: string;
  daysTo: string;
  rows: number;
  durationMs: number;
};

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const recomputeMoneyDays = async (now: Date = new Date()): Promise<MoneyRecomputeSummary> => {
  const startedAt = Date.now();
  const daysFrom = MONEY_FIRST_DAY;
  const daysTo = previousDayKey(now);
  const runId = await startMetricMoneyRun(daysFrom, daysTo);

  try {
    const rows = await replaceMetricMoneyDays(runId, daysFrom, daysTo, {
      parkFee: PARK_FEE_CATEGORY_ID,
      payment: PAYMENT_CATEGORY_IDS,
    });

    return { runId, daysFrom, daysTo, rows, durationMs: Date.now() - startedAt };
  } catch (error) {
    await failMetricMoneyRun(runId, describeError(error));
    throw error;
  }
};
