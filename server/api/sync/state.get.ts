import { readSyncWatermarks } from '#server/services/sync/readSyncWatermarks';
import type { SyncStateResponse } from '#shared/types/sync';

// Отметки синхронизации с состоянием по каждому виду прогона. Только чтение — как и все
// ручки этого экрана: экран, с которого можно поправить данные, обходит журнал.
export default defineEventHandler((): Promise<SyncStateResponse> => readSyncWatermarks());
