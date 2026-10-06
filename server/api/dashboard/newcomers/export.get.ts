import { createError } from 'h3';

import { MetricsMonthError } from '#server/services/metrics/monthPeriod';
import { listNewcomersExport, newcomersFileName, NewcomersListError } from '#server/services/metrics/listNewcomersExport';
import { buildReportWorkbook } from '#server/services/reports/buildReportWorkbook';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { sendReportFile } from '#server/utils/reportDownload';
import { METRICS_ROLES } from '#shared/access';

// Список «Новички {месяца}: меньше 20 поездок за 14 дней» за месяц файлом `.xlsx` (issue #407) —
// кнопка «Выгрузить в Excel» на «Глубине». Доступ — как у вкладки. Негодный месяц и список, который
// не строится, — `400` с причиной: отказ про то, что прислали, а не про доступ.
export default defineEventHandler(async (event): Promise<Buffer> => {
  await requireEmployeeRole(event, METRICS_ROLES);

  const month = getQuery(event).month;

  try {
    const content = await buildReportWorkbook(await listNewcomersExport(month));

    return sendReportFile(event, content, newcomersFileName(month));
  } catch (error) {
    if (error instanceof MetricsMonthError || error instanceof NewcomersListError) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: error.message });
    }

    throw error;
  }
});
