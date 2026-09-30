import { listReportOffices } from '#server/repositories/reports';
import type { ReportOptionsResponse } from '#shared/types/reports';

/**
 * Что выбирать в фильтре отчётов: живые офисы парка, архивные тоже — по ним бывают продажи
 * и остатки прошлых дат. Демо-офиса здесь нет: демо не входит ни в одну общую цифру.
 */
export const readReportOptions = async (): Promise<ReportOptionsResponse> => {
  const rows = await listReportOffices();

  return {
    offices: rows.map((row) => ({ officeId: row.id, name: row.name, archived: row.archived })),
  };
};
