import { createError } from 'h3';

import { leadersFileName, LeadersListError, listLeadersExport } from '#server/services/metrics/listLeadersExport';
import { MetricsMonthError } from '#server/services/metrics/monthPeriod';
import { buildReportWorkbook } from '#server/services/reports/buildReportWorkbook';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { sendReportFile } from '#server/utils/reportDownload';
import { METRICS_ROLES } from '#shared/access';

// Список лидеров «Ездят меньше обычного, перестали или ушли» за месяц файлом `.xlsx` (issue #402) —
// кнопка «Выгрузить в Excel» на «Рычагах». Доступ — как у вкладки. Негодный месяц и список, который
// не строится, — `400` с причиной: отказ про то, что прислали, а не про доступ.
export default defineEventHandler(async (event): Promise<Buffer> => {
  await requireEmployeeRole(event, METRICS_ROLES);

  const month = getQuery(event).month;

  try {
    const content = await buildReportWorkbook(await listLeadersExport(month));

    return sendReportFile(event, content, leadersFileName(month));
  } catch (error) {
    if (error instanceof MetricsMonthError || error instanceof LeadersListError) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: error.message });
    }

    throw error;
  }
});
