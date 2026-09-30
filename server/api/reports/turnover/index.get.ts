import { readPeriodParams } from '#server/services/reports/reportParams';
import { readTurnoverReport } from '#server/services/reports/readTurnoverReport';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { rethrowReportFailure } from '#server/utils/reportFailure';
import { REPORT_ROLES } from '#shared/access';
import type { ReportResult } from '#shared/types/reports';

// «Движение товара» на экран (issue #309). Выгрузка — `export.get.ts` рядом, тем же сервисом.
export default defineEventHandler(async (event): Promise<ReportResult> => {
  await requireEmployeeRole(event, REPORT_ROLES);

  try {
    return await readTurnoverReport(await readPeriodParams(getQuery(event)));
  } catch (error) {
    return rethrowReportFailure(error);
  }
});
