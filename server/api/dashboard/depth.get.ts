import { createError } from 'h3';

import { MetricsMonthError } from '#server/services/metrics/monthPeriod';
import { readDashboardDepth } from '#server/services/metrics/readDashboardDepth';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { METRICS_ROLES } from '#shared/access';
import type { DashboardDepth } from '#shared/types/dashboard';

// Вкладка «Глубина» дашборда за месяц (issue #373). Негодный месяц — `400` с текстом правила,
// как у «Рычагов»: отказ про то, что прислали, а не про доступ.
export default defineEventHandler(async (event): Promise<DashboardDepth> => {
  await requireEmployeeRole(event, METRICS_ROLES);

  try {
    return await readDashboardDepth(getQuery(event).month);
  } catch (error) {
    if (error instanceof MetricsMonthError) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: error.message });
    }

    throw error;
  }
});
