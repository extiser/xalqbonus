import { createError } from 'h3';

import {
  listOutsideProgramDrivers,
  outsideProgramFileName,
} from '#server/services/metrics/listOutsideProgramDrivers';
import { MetricsMonthError } from '#server/services/metrics/monthPeriod';
import { buildReportWorkbook } from '#server/services/reports/buildReportWorkbook';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { sendReportFile } from '#server/utils/reportDownload';
import { METRICS_ROLES } from '#shared/access';

// Водители вне программы за месяц файлом `.xlsx` (issue #373) — кнопка «Скачать список»
// плитки «Вне программы». Доступ — как у вкладки, негодный месяц — `400`, как у неё же.
export default defineEventHandler(async (event): Promise<Buffer> => {
  await requireEmployeeRole(event, METRICS_ROLES);

  const month = getQuery(event).month;

  try {
    const content = await buildReportWorkbook(await listOutsideProgramDrivers(month));

    return sendReportFile(event, content, outsideProgramFileName(month));
  } catch (error) {
    if (error instanceof MetricsMonthError) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: error.message });
    }

    throw error;
  }
});
