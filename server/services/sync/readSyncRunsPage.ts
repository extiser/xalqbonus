import { countSyncRuns, listSyncRuns, type SyncRunListRow } from '#server/repositories/syncRuns';
import { readSyncConfig } from '#server/services/sync/config';
import type { SyncRunRow, SyncRunsResponse } from '#shared/types/sync';

/**
 * Страница журнала прогонов, новыми вперёд.
 *
 * Единственное, что сервис здесь добавляет к строкам базы, — две величины, которых
 * в базе нет: сколько прогон шёл и не висит ли он в `running` дольше законного.
 *
 * Второе принципиально: строку `running` закрывает сам прогон, но `SIGKILL` такой
 * возможности не даёт, и оборванный прогон остаётся бежать вечно. Показать его успешным
 * нельзя — успешным он не является; показать отказом тоже нельзя — его никто не закрывал.
 * Порог законной длительности — тот же `SYNC_ABANDONED_RUN_MIN`, по которому воркер
 * закрывает такие строки на старте.
 */

/** Сколько строк журнала отдаётся за раз, если страница не попросила иначе. */
const DEFAULT_LIMIT = 20;

/** Потолок страницы: журнал растёт на прогон в минуту, и выгрузить его целиком нельзя. */
const MAX_LIMIT = 100;

export type SyncRunsPageRequest = {
  limit: number;
  offset: number;
};

const toRow = (run: SyncRunListRow, now: Date, abandonedAfterMs: number): SyncRunRow => {
  const startedAtMs = run.startedAt.getTime();
  // У незакрытого прогона показывается не «неизвестно», а сколько он идёт до сих пор:
  // именно это число отвечает на вопрос, законно ли он ещё идёт.
  const finishedAtMs = run.finishedAt?.getTime() ?? now.getTime();

  return {
    id: run.id,
    kind: run.kind,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    windowFrom: run.windowFrom?.toISOString() ?? null,
    windowTo: run.windowTo?.toISOString() ?? null,
    durationMs: finishedAtMs - startedAtMs,
    requests: run.requests,
    rateLimited: run.rateLimited,
    itemsSeen: run.itemsSeen,
    itemsWritten: run.itemsWritten,
    error: run.error,
    stalled: run.status === 'running' && now.getTime() - startedAtMs > abandonedAfterMs,
    orders: run.orders,
    registry: run.registry,
  };
};

export const readSyncRunsPage = async (request: SyncRunsPageRequest): Promise<SyncRunsResponse> => {
  const limit = Math.min(Math.max(request.limit, 1), MAX_LIMIT);
  const offset = Math.max(request.offset, 0);

  const config = readSyncConfig();
  const [runs, total] = await Promise.all([listSyncRuns(limit, offset), countSyncRuns()]);
  const now = new Date();
  const abandonedAfterMs = config.abandonedRunMinutes * 60_000;

  return {
    now: now.toISOString(),
    runs: runs.map((run) => toRow(run, now, abandonedAfterMs)),
    total,
    limit,
    offset,
  };
};

export { DEFAULT_LIMIT as DEFAULT_RUNS_LIMIT };
