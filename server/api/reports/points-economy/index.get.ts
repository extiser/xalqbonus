import { readParkPeriodParams } from '#server/services/reports/reportParams';
import { readPointsEconomyReport } from '#server/services/reports/readPointsEconomyReport';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { rethrowReportFailure } from '#server/utils/reportFailure';
import { REPORT_ROLES } from '#shared/access';
import type { ReportResult } from '#shared/types/reports';

// «Экономика балла» на экран (issue #310). Выгрузка — `export.get.ts` рядом, тем же сервисом.
export default defineEventHandler(async (event): Promise<ReportResult> => {
  await requireEmployeeRole(event, REPORT_ROLES);

  try {
    return await readPointsEconomyReport(readParkPeriodParams(getQuery(event)));
  } catch (error) {
    return rethrowReportFailure(error);
  }
});
