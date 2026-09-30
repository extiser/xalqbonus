import { buildReportWorkbook } from '#server/services/reports/buildReportWorkbook';
import { readPeriodParams } from '#server/services/reports/reportParams';
import { readAdjustmentsReport, adjustmentsReportFileName } from '#server/services/reports/readAdjustmentsReport';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { sendReportFile } from '#server/utils/reportDownload';
import { rethrowReportFailure } from '#server/utils/reportFailure';
import { REPORT_ROLES } from '#shared/access';

// «Корректировки остатков» файлом `.xlsx` (issue #309). Тот же сервис, что у экрана: цифры в файле
// и на экране одни и те же по построению.
export default defineEventHandler(async (event): Promise<Buffer> => {
  await requireEmployeeRole(event, REPORT_ROLES);

  try {
    const params = await readPeriodParams(getQuery(event));
    const content = await buildReportWorkbook(await readAdjustmentsReport(params));

    return sendReportFile(event, content, adjustmentsReportFileName(params));
  } catch (error) {
    return rethrowReportFailure(error);
  }
});
