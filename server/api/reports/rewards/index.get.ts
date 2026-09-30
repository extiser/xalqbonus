import { readPeriodParams } from '#server/services/reports/reportParams';
import { readRewardsReport } from '#server/services/reports/readRewardsReport';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { rethrowReportFailure } from '#server/utils/reportFailure';
import { REPORT_ROLES } from '#shared/access';
import type { ReportResult } from '#shared/types/reports';

// «Награды и подарки» на экран (issue #310). Выгрузка — `export.get.ts` рядом, тем же сервисом.
export default defineEventHandler(async (event): Promise<ReportResult> => {
  await requireEmployeeRole(event, REPORT_ROLES);

  try {
    return await readRewardsReport(await readPeriodParams(getQuery(event)));
  } catch (error) {
    return rethrowReportFailure(error);
  }
});
