import { buildReportWorkbook } from '#server/services/reports/buildReportWorkbook';
import { readPeriodParams } from '#server/services/reports/reportParams';
import { readRewardsReport, rewardsReportFileName } from '#server/services/reports/readRewardsReport';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { sendReportFile } from '#server/utils/reportDownload';
import { rethrowReportFailure } from '#server/utils/reportFailure';
import { REPORT_ROLES } from '#shared/access';

// «Награды и подарки» файлом `.xlsx` (issue #310). Тот же сервис, что у экрана: цифры в файле
// и на экране одни и те же по построению.
export default defineEventHandler(async (event): Promise<Buffer> => {
  await requireEmployeeRole(event, REPORT_ROLES);

  try {
    const params = await readPeriodParams(getQuery(event));
    const content = await buildReportWorkbook(await readRewardsReport(params));

    return sendReportFile(event, content, rewardsReportFileName(params));
  } catch (error) {
    return rethrowReportFailure(error);
  }
});
