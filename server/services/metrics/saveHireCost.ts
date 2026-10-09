import { upsertHireCost } from '#server/repositories/dashboardHireCosts';
import { metricsMonthRange, MetricsMonthError, readMetricsMonth } from '#server/services/metrics/monthPeriod';
import type { HireCostDenialCode, HireCostMonthRange } from '#shared/hireCost';
import type { DashboardHireCostRecord } from '#shared/types/dashboard';

/**
 * Запись расходов на найм из окна «Расходы на найм» (issue #445): сумма за один месяц — за закрытый
 * по факту, на идущий бюджетом. Запись на тот же месяц заменяется, удаления нет.
 *
 * Проверка — здесь, а не в форме (docs/frontend.md → «Обязательное поле — свойство поля»), и отказ
 * называет все негодные поля сразу. Месяц — любой по правилу `readMetricsMonth`: от первого месяца
 * дашборда по идущий включительно. Сумма — целое число сумов больше нуля.
 */
export class HireCostInputError extends Error {
  constructor(
    readonly problems: readonly [HireCostDenialCode, ...HireCostDenialCode[]],
    /** Месяцы, которые можно выбрать, — для текста отказа по месяцу. */
    readonly range: HireCostMonthRange,
  ) {
    super(`расходы на найм не годятся: ${problems.join(', ')}`);
    this.name = 'HireCostInputError';
  }
}

/** Месяц записи; негодный — `null`, беда уже в списке. */
const readHireCostMonth = (value: unknown, now: Date, problems: HireCostDenialCode[]): string | null => {
  // Пустой месяц `readMetricsMonth` прочитал бы как последний — у записи он обязателен.
  if (typeof value !== 'string' || value === '') {
    problems.push('hire_cost_month_invalid');

    return null;
  }

  try {
    return readMetricsMonth(value, now);
  } catch (error) {
    if (!(error instanceof MetricsMonthError)) throw error;
  }

  problems.push('hire_cost_month_invalid');

  return null;
};

const readHireCostAmount = (value: unknown, problems: HireCostDenialCode[]): number | null => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;

  problems.push('hire_cost_amount_invalid');

  return null;
};

export const saveHireCost = async (
  input: { month: unknown; amount: unknown; employeeId: string },
  now: Date = new Date(),
): Promise<DashboardHireCostRecord> => {
  const range: HireCostMonthRange = metricsMonthRange(now);
  const problems: HireCostDenialCode[] = [];

  const amount = readHireCostAmount(input.amount, problems);
  const month = readHireCostMonth(input.month, now, problems);
  const [first, ...rest] = problems;

  if (first !== undefined) {
    throw new HireCostInputError([first, ...rest], range);
  }

  // Без бед в списке оба поля прочитаны: негодное чтение всегда кладёт свою беду.
  if (amount === null || month === null) {
    throw new Error('расходы на найм: поле без беды не прочитано');
  }

  const row = await upsertHireCost({ month, amount, employeeId: input.employeeId });

  return { ...row, updatedAt: row.updatedAt.toISOString() };
};
