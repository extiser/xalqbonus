import { DEFAULT_SKIPS_LIMIT, readSyncSkipsPage } from '#server/services/sync/readSyncSkipsPage';
import { readPositiveInteger } from '#server/utils/query';
import type { SyncSkipsResponse } from '#shared/types/sync';

// Нерешённое пропущенное страницей: что синхронизация не смогла записать и не записала
// до сих пор.
export default defineEventHandler((event): Promise<SyncSkipsResponse> => {
  const query = getQuery(event);

  return readSyncSkipsPage({
    limit: readPositiveInteger(query.limit, DEFAULT_SKIPS_LIMIT),
    offset: readPositiveInteger(query.offset, 0),
  });
});
