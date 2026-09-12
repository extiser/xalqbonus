import { readSyncSummary } from '#server/services/sync/readSyncSummary';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { SYNC_ROLES } from '#shared/access';
import type { SyncSummaryResponse } from '#shared/types/sync';

// Свод за сутки и за неделю — различными сущностями по таблицам данных, а не суммой
// счётчиков прогонов (issue #29, правило 1).
export default defineEventHandler(async (event): Promise<SyncSummaryResponse> => {
  await requireEmployeeRole(event, SYNC_ROLES);

  return readSyncSummary();
});
