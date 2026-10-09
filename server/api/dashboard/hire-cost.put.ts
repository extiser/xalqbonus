import { saveHireCost } from '#server/services/metrics/saveHireCost';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { rejectHireCostFailure } from '#server/utils/hireCostFailure';
import { METRICS_ROLES } from '#shared/access';
import type { DashboardHireCostRecord } from '#shared/types/dashboard';

// Расходы на найм из окна плитки «Окупается ли найм» на «Глубине» (issue #445). Права — те же,
// что у дашборда, автор записи — вошедший сотрудник. Годятся ли месяц и сумма, решает сервис;
// отказ — кодом и текстом по полю формы.
export default defineEventHandler(async (event): Promise<DashboardHireCostRecord> => {
  const employee = await requireEmployeeRole(event, METRICS_ROLES);
  const body = await readBody<{ month?: unknown; amount?: unknown } | null>(event);

  try {
    return await saveHireCost({ month: body?.month, amount: body?.amount, employeeId: employee.employeeId });
  } catch (error) {
    throw rejectHireCostFailure(error);
  }
});
