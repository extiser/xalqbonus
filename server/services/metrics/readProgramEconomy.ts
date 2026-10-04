import {
  readPointCostTotalsBefore,
  readPointDebtBefore,
  sumPointFlows,
} from '#server/repositories/metrics';
import { POINT_FLOW_REASONS } from '#server/services/metrics/pointFlows';
import { shiftDayKey } from '#server/utils/parkTime';
import type { DashboardProgramEconomy } from '#shared/types/dashboard';

/**
 * Плитка «Экономика программы» за сутки `from`–`to` включительно (issue #373; docs/decisions.md →
 * «Баллы в метриках дашборда»).
 *
 * Выдано и потрачено — за период (`pointFlows.ts`), выкуп — их отношение процентом до целого.
 *
 * Цена балла — на конец периода и за всё время программы, а не за месяц: при паре заказов
 * в месяц месячная цена — шум. Считается по снимку себестоимости в строке заказа:
 * `Σ quantity × unit_cost ÷ Σ quantity × unit_points` по строкам со снимком. Рядом — число
 * заказов, по которым она посчитана, и строк без снимка.
 *
 * Долг — главным числом в баллах: сумма плюсовых балансов на конец периода. В сумах — долг ×
 * цена балла на тот же момент. Изменение — долг на конец минус долг на начало периода.
 *
 * Покрытие суток у баллов не считается: журнал полный по построению.
 */
export const readProgramEconomy = async (period: {
  from: string;
  to: string;
}): Promise<DashboardProgramEconomy> => {
  const periodEnd = shiftDayKey(period.to, 1);
  const [flows, cost, debtAtEnd, debtAtStart] = await Promise.all([
    sumPointFlows(POINT_FLOW_REASONS, period.from, period.to),
    readPointCostTotalsBefore(periodEnd),
    readPointDebtBefore(periodEnd),
    readPointDebtBefore(period.from),
  ]);

  const pointCost = cost.orders > 0 && cost.points > 0 ? Math.round(cost.cost / cost.points) : null;

  return {
    issued: flows.issued,
    spent: flows.spent,
    redemptionPercent: flows.issued > 0 ? Math.round((flows.spent / flows.issued) * 100) : null,
    pointCost,
    pointCostOrders: cost.orders,
    pointCostUnpricedLines: cost.unpricedLines,
    debtPoints: debtAtEnd,
    debtPointsChange: debtAtEnd - debtAtStart,
    debtSum: pointCost === null ? null : debtAtEnd * pointCost,
  };
};
