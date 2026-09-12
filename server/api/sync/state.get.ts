import { readSyncWatermarks } from '#server/services/sync/readSyncWatermarks';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { SYNC_ROLES } from '#shared/access';
import type { SyncStateResponse } from '#shared/types/sync';

// Отметки синхронизации с состоянием по каждому виду прогона. Только чтение — как и все
// ручки этого экрана: экран, с которого можно поправить данные, обходит журнал.
export default defineEventHandler(async (event): Promise<SyncStateResponse> => {
  await requireEmployeeRole(event, SYNC_ROLES);

  return readSyncWatermarks();
});
