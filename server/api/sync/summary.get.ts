import { readSyncSummary } from '#server/services/sync/readSyncSummary';
import type { SyncSummaryResponse } from '#shared/types/sync';

// Свод за сутки и за неделю — различными сущностями по таблицам данных, а не суммой
// счётчиков прогонов (issue #29, правило 1).
export default defineEventHandler((): Promise<SyncSummaryResponse> => readSyncSummary());
