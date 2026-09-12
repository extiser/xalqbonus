import { DEFAULT_RUNS_LIMIT, readSyncRunsPage } from '#server/services/sync/readSyncRunsPage';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { readPositiveInteger } from '#server/utils/query';
import { SYNC_ROLES } from '#shared/access';
import type { SyncRunsResponse } from '#shared/types/sync';

// Журнал прогонов страницей, новыми вперёд. Постранично намеренно: журнал растёт
// на прогон в минуту, и выгружать его целиком в один ответ нельзя уже через сутки.
export default defineEventHandler(async (event): Promise<SyncRunsResponse> => {
  await requireEmployeeRole(event, SYNC_ROLES);

  const query = getQuery(event);

  return readSyncRunsPage({
    limit: readPositiveInteger(query.limit, DEFAULT_RUNS_LIMIT),
    offset: readPositiveInteger(query.offset, 0),
  });
});
