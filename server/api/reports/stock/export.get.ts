import { buildReportWorkbook } from '#server/services/reports/buildReportWorkbook';
import { readStockParams } from '#server/services/reports/reportParams';
import { readStockReport, stockReportFileName } from '#server/services/reports/readStockReport';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { sendReportFile } from '#server/utils/reportDownload';
import { rethrowReportFailure } from '#server/utils/reportFailure';
import { REPORT_ROLES } from '#shared/access';

// «Остатки на дату» файлом `.xlsx` (issue #308). Тот же сервис, что у экрана: цифры в файле
// и на экране одни и те же по построению.
export default defineEventHandler(async (event): Promise<Buffer> => {
  await requireEmployeeRole(event, REPORT_ROLES);

  try {
    const params = await readStockParams(getQuery(event));
    const content = await buildReportWorkbook(await readStockReport(params));

    return sendReportFile(event, content, stockReportFileName(params));
  } catch (error) {
    return rethrowReportFailure(error);
  }
});
