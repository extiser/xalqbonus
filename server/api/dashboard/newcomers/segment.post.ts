import { createError } from 'h3';

import { createNewcomersSegment } from '#server/services/metrics/createNewcomersSegment';
import { DashboardSegmentEmptyError } from '#server/services/metrics/dashboardSegment';
import { NewcomersListError } from '#server/services/metrics/listNewcomersExport';
import { MetricsMonthError } from '#server/services/metrics/monthPeriod';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { SEGMENT_ROLES } from '#shared/access';
import type { SegmentResponse } from '#shared/types/segment';

// «Сделать сегмент» у списка новичков на «Глубине» (issue #415): участники программы из списка
// за месяц ложатся сегментом-списком. Права — как у заведения сегмента, автор — вошедший
// сотрудник. Негодный месяц и список, который не строится, — `400` с причиной, как у выгрузки;
// участников в списке нет — `409`.
export default defineEventHandler(async (event): Promise<SegmentResponse> => {
  const employee = await requireEmployeeRole(event, SEGMENT_ROLES);

  const body = await readBody<{ month?: unknown } | null>(event);

  try {
    return { segment: await createNewcomersSegment(body?.month, employee.employeeId) };
  } catch (error) {
    if (error instanceof MetricsMonthError || error instanceof NewcomersListError) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: error.message });
    }

    if (error instanceof DashboardSegmentEmptyError) {
      throw createError({ statusCode: 409, statusMessage: 'Conflict', message: error.message });
    }

    throw error;
  }
});
