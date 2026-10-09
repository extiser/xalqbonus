import { upsertHireCost } from '#server/repositories/dashboardHireCosts';
import { metricsMonthRange, MetricsMonthError, readMetricsMonth } from '#server/services/metrics/monthPeriod';
import { valueMonthOf } from '#server/services/metrics/personMonthValue';
import type { HireCostDenialCode, HireCostMonthRange } from '#shared/hireCost';
import type { DashboardHireCostRecord } from '#shared/types/dashboard';

/**
 * Запись расходов на найм из окна «Расходы на найм» (issue #445) — docs/decisions.md →
 * «Окупаемость найма на дашборде»: сумма действует с выбранного месяца и дальше, запись на тот же
 * месяц заменяется, удаления нет.
 *
 * Проверка — здесь, а не в форме (docs/frontend.md → «Обязательное поле — свойство поля»), и отказ
 * называет все негодные поля сразу. Месяц — по правилу `readMetricsMonth` и не позже последнего
 * закрытого: в идущем месяце нанятых ещё не все. Сумма — целое число сумов больше нуля.
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
const readHireCostMonth = (
  value: unknown,
  range: HireCostMonthRange,
  now: Date,
  problems: HireCostDenialCode[],
): string | null => {
  // Пустой месяц `readMetricsMonth` прочитал бы как последний — у записи он обязателен.
  if (typeof value !== 'string' || value === '') {
    problems.push('hire_cost_month_invalid');

    return null;
  }

  try {
    const month = readMetricsMonth(value, now);

    if (month <= range.lastMonth) return month;
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
  const { firstMonth, lastMonth } = metricsMonthRange(now);
  const range: HireCostMonthRange = { firstMonth, lastMonth: valueMonthOf(lastMonth, now).month };
  const problems: HireCostDenialCode[] = [];

  const amount = readHireCostAmount(input.amount, problems);
  const month = readHireCostMonth(input.month, range, now, problems);
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
