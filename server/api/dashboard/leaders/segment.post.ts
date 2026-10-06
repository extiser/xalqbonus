import { createError } from 'h3';

import { createLeadersSegment } from '#server/services/metrics/createLeadersSegment';
import { DashboardSegmentEmptyError } from '#server/services/metrics/dashboardSegment';
import { LeadersListError } from '#server/services/metrics/listLeadersExport';
import { MetricsMonthError } from '#server/services/metrics/monthPeriod';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { SEGMENT_ROLES } from '#shared/access';
import type { SegmentResponse } from '#shared/types/segment';

// «Сделать сегмент» у списка лидеров на «Рычагах» (issue #415): участники программы из списка
// за месяц ложатся сегментом-списком. Права — как у заведения сегмента, автор — вошедший
// сотрудник. Негодный месяц и список, который не строится, — `400` с причиной, как у выгрузки;
// участников в списке нет — `409`.
export default defineEventHandler(async (event): Promise<SegmentResponse> => {
  const employee = await requireEmployeeRole(event, SEGMENT_ROLES);

  const body = await readBody<{ month?: unknown } | null>(event);

  try {
    return { segment: await createLeadersSegment(body?.month, employee.employeeId) };
  } catch (error) {
    if (error instanceof MetricsMonthError || error instanceof LeadersListError) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: error.message });
    }

    if (error instanceof DashboardSegmentEmptyError) {
      throw createError({ statusCode: 409, statusMessage: 'Conflict', message: error.message });
    }

    throw error;
  }
});
