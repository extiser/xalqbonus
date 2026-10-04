import { createError } from 'h3';

import { MetricsMonthError } from '#server/services/metrics/monthPeriod';
import { readDashboardLevers } from '#server/services/metrics/readDashboardLevers';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { METRICS_ROLES } from '#shared/access';
import type { DashboardLevers } from '#shared/types/dashboard';

// Вкладка «Рычаги» дашборда за месяц (issue #371). Негодный месяц — `400` с текстом правила:
// отказ про то, что прислали, а не про доступ (docs/decisions.md → «Отказ двери веба говорит
// кодом, а текст живёт словарём»).
export default defineEventHandler(async (event): Promise<DashboardLevers> => {
  await requireEmployeeRole(event, METRICS_ROLES);

  try {
    return await readDashboardLevers(getQuery(event).month);
  } catch (error) {
    if (error instanceof MetricsMonthError) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: error.message });
    }

    throw error;
  }
});
