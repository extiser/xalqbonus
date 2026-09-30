import { readPeriodParams } from '#server/services/reports/reportParams';
import { readAdjustmentsReport } from '#server/services/reports/readAdjustmentsReport';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { rethrowReportFailure } from '#server/utils/reportFailure';
import { REPORT_ROLES } from '#shared/access';
import type { ReportResult } from '#shared/types/reports';

// «Корректировки остатков» на экран (issue #309). Выгрузка — `export.get.ts` рядом, тем же сервисом.
export default defineEventHandler(async (event): Promise<ReportResult> => {
  await requireEmployeeRole(event, REPORT_ROLES);

  try {
    return await readAdjustmentsReport(await readPeriodParams(getQuery(event)));
  } catch (error) {
    return rethrowReportFailure(error);
  }
});
