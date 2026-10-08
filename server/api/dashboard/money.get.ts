import { createError } from 'h3';

import { MetricsMonthError } from '#server/services/metrics/monthPeriod';
import { readDashboardMoney } from '#server/services/metrics/readDashboardMoney';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { METRICS_ROLES } from '#shared/access';
import type { DashboardMoney } from '#shared/types/dashboard';

// Вкладка «Деньги» дашборда за месяц (issue #438). Негодный месяц — `400` с текстом правила,
// как у «Рычагов»: отказ про то, что прислали, а не про доступ.
export default defineEventHandler(async (event): Promise<DashboardMoney> => {
  await requireEmployeeRole(event, METRICS_ROLES);

  try {
    return await readDashboardMoney(getQuery(event).month);
  } catch (error) {
    if (error instanceof MetricsMonthError) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: error.message });
    }

    throw error;
  }
});
