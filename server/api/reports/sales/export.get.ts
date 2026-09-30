import { buildReportWorkbook } from '#server/services/reports/buildReportWorkbook';
import { readSalesParams } from '#server/services/reports/reportParams';
import { readSalesReport, salesReportFileName } from '#server/services/reports/readSalesReport';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { sendReportFile } from '#server/utils/reportDownload';
import { rethrowReportFailure } from '#server/utils/reportFailure';
import { REPORT_ROLES } from '#shared/access';

// «Продажи за период» файлом `.xlsx` (issue #308). Тот же сервис, что у экрана: цифры в файле
// и на экране одни и те же по построению.
export default defineEventHandler(async (event): Promise<Buffer> => {
  await requireEmployeeRole(event, REPORT_ROLES);

  try {
    const params = await readSalesParams(getQuery(event));
    const content = await buildReportWorkbook(await readSalesReport(params));

    return sendReportFile(event, content, salesReportFileName(params));
  } catch (error) {
    return rethrowReportFailure(error);
  }
});
