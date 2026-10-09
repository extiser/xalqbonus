import { db } from '#server/db';

/**
 * Расходы парка на найм — сумма за один месяц (issue #445): за закрытый — по факту, на идущий —
 * бюджет. На другие месяцы запись не действует. Месяцы ходят `YYYY-MM`, в таблице — первым числом.
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

/** Запись месяца. `null` — расходы за него не заданы. */
export const readHireCost = async (month: string): Promise<HireCostRow | null> => {
  const row = await db.dashboardHireCost.findUnique({ where: { month: new Date(`${month}-01T00:00:00Z`) } });

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
