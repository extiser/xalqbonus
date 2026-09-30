import { readStockParams } from '#server/services/reports/reportParams';
import { readStockReport } from '#server/services/reports/readStockReport';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { rethrowReportFailure } from '#server/utils/reportFailure';
import { REPORT_ROLES } from '#shared/access';
import type { ReportResult } from '#shared/types/reports';

// «Остатки на дату» на экран (issue #308). Выгрузка — `export.get.ts` рядом, тем же сервисом.
export default defineEventHandler(async (event): Promise<ReportResult> => {
  await requireEmployeeRole(event, REPORT_ROLES);

  try {
    return await readStockReport(await readStockParams(getQuery(event)));
  } catch (error) {
    return rethrowReportFailure(error);
  }
});
