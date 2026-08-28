import { DEFAULT_RUNS_LIMIT, readSyncRunsPage } from '#server/services/sync/readSyncRunsPage';
import { readPositiveInteger } from '#server/utils/query';
import type { SyncRunsResponse } from '#shared/types/sync';

// Журнал прогонов страницей, новыми вперёд. Постранично намеренно: журнал растёт
// на прогон в минуту, и выгружать его целиком в один ответ нельзя уже через сутки.
export default defineEventHandler((event): Promise<SyncRunsResponse> => {
  const query = getQuery(event);

  return readSyncRunsPage({
    limit: readPositiveInteger(query.limit, DEFAULT_RUNS_LIMIT),
    offset: readPositiveInteger(query.offset, 0),
  });
});
