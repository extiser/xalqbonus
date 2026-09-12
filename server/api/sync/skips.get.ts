import { DEFAULT_SKIPS_LIMIT, readSyncSkipsPage } from '#server/services/sync/readSyncSkipsPage';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { readPositiveInteger } from '#server/utils/query';
import { SYNC_ROLES } from '#shared/access';
import type { SyncSkipsResponse } from '#shared/types/sync';

// Нерешённое пропущенное страницей: что синхронизация не смогла записать и не записала
// до сих пор.
export default defineEventHandler(async (event): Promise<SyncSkipsResponse> => {
  await requireEmployeeRole(event, SYNC_ROLES);

  const query = getQuery(event);

  return readSyncSkipsPage({
    limit: readPositiveInteger(query.limit, DEFAULT_SKIPS_LIMIT),
    offset: readPositiveInteger(query.offset, 0),
  });
});
