import { db } from '#server/db';

/**
 * Расходы парка на найм — записи «с какого месяца действует» (issue #445). Месяцы ходят
 * `YYYY-MM`, в таблице — первым числом.
 */

export type HireCostRow = {
  /** Месяц, с которого действует сумма, `YYYY-MM`. */
  month: string;
  /** Сум за месяц. */
  amount: number;
  updatedBy: string;
  updatedAt: Date;
};

const monthOf = (value: Date): string => value.toISOString().slice(0, 7);

const toRow = (row: { month: Date; amount: bigint; updatedBy: string; updatedAt: Date }): HireCostRow => ({
  month: monthOf(row.month),
  amount: Number(row.amount),
  updatedBy: row.updatedBy,
  updatedAt: row.updatedAt,
});

/** Запись, действующая в месяце: наибольший `month` не позже него. `null` — расходы не заданы. */
export const readHireCostAt = async (month: string): Promise<HireCostRow | null> => {
  const row = await db.dashboardHireCost.findFirst({
    where: { month: { lte: new Date(`${month}-01T00:00:00Z`) } },
    orderBy: { month: 'desc' },
  });

  return row === null ? null : toRow(row);
};

/** Запись на месяц: есть на тот же месяц — заменяется. */
export const upsertHireCost = async (input: {
  month: string;
  amount: number;
  employeeId: string;
}): Promise<HireCostRow> => {
  const month = new Date(`${input.month}-01T00:00:00Z`);
  const amount = BigInt(input.amount);

  const row = await db.dashboardHireCost.upsert({
    where: { month },
    create: { month, amount, updatedBy: input.employeeId },
    update: { amount, updatedBy: input.employeeId },
  });

  return toRow(row);
};
