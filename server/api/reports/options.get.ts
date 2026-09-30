import { readReportOptions } from '#server/services/reports/readReportOptions';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { REPORT_ROLES } from '#shared/access';
import type { ReportOptionsResponse } from '#shared/types/reports';

// Выбор офиса для отчётов (issue #308): живые офисы, архивные последними.
export default defineEventHandler(async (event): Promise<ReportOptionsResponse> => {
  await requireEmployeeRole(event, REPORT_ROLES);

  return readReportOptions();
});
