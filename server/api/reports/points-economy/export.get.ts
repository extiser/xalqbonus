import { buildReportWorkbook } from '#server/services/reports/buildReportWorkbook';
import { readParkPeriodParams } from '#server/services/reports/reportParams';
import { readPointsEconomyReport, pointsEconomyReportFileName } from '#server/services/reports/readPointsEconomyReport';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { sendReportFile } from '#server/utils/reportDownload';
import { rethrowReportFailure } from '#server/utils/reportFailure';
import { REPORT_ROLES } from '#shared/access';

// «Экономика балла» файлом `.xlsx` (issue #310). Тот же сервис, что у экрана: цифры в файле
// и на экране одни и те же по построению.
export default defineEventHandler(async (event): Promise<Buffer> => {
  await requireEmployeeRole(event, REPORT_ROLES);

  try {
    const params = readParkPeriodParams(getQuery(event));
    const content = await buildReportWorkbook(await readPointsEconomyReport(params));

    return sendReportFile(event, content, pointsEconomyReportFileName(params));
  } catch (error) {
    return rethrowReportFailure(error);
  }
});
