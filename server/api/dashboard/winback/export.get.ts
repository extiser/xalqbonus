import { createError } from 'h3';

import { listWinbackExport, winbackFileName, WinbackPoolError } from '#server/services/metrics/listWinbackExport';
import { MetricsMonthError } from '#server/services/metrics/monthPeriod';
import { buildReportWorkbook } from '#server/services/reports/buildReportWorkbook';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { sendReportFile } from '#server/utils/reportDownload';
import { METRICS_ROLES } from '#shared/access';

// Ушедшие 1–12 месяцев назад за месяц файлом `.xlsx` (issue #446) — кнопка «Выгрузить для обзвона»
// плитки «Можно вернуть». Доступ — как у вкладки. Негодный месяц и пул без цифр — `400` с причиной:
// отказ про то, что прислали, а не про доступ.
export default defineEventHandler(async (event): Promise<Buffer> => {
  await requireEmployeeRole(event, METRICS_ROLES);

  const month = getQuery(event).month;

  try {
    const content = await buildReportWorkbook(await listWinbackExport(month));

    return sendReportFile(event, content, winbackFileName(month));
  } catch (error) {
    if (error instanceof MetricsMonthError || error instanceof WinbackPoolError) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: error.message });
    }

    throw error;
  }
});
