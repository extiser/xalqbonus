import { db } from '#server/db';
import type { SyncKind, SyncStatus } from '#server/generated/prisma/enums';

/**
 * Журнал прогонов синхронизации.
 *
 * Строка заводится в начале прогона и закрывается в конце — успехом или отказом. Прогон,
 * упавший на середине, обязан остаться в базе видимым отказом: в старом боте неуспех
 * не оставлял следа, отметка при этом сдвигалась, и потери выглядели нормой
 * (docs/decisions.md → «Отметка синхронизации двигается только после успешного прогона»).
 */

export type SyncRunCounters = {
  requests: number;
  rateLimited: number;
  itemsSeen: number;
  itemsWritten: number;
};

export const startSyncRun = async (
  kind: SyncKind,
  windowFrom: Date,
  windowTo: Date,
): Promise<string> => {
  const rows = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO xb.sync_runs ("kind", "status", "window_from", "window_to")
    VALUES (
      ${kind}::xb.sync_kind,
      'running'::xb.sync_status,
      ${windowFrom.toISOString()}::timestamptz,
      ${windowTo.toISOString()}::timestamptz
    )
    RETURNING "id"
  `;

  const run = rows[0];

  if (!run) {
    throw new Error(`строка прогона ${kind} не завелась`);
  }

  return run.id;
};

/**
 * Закрывает прогон. Счётчики пишутся и при отказе: именно у упавшего прогона важно видеть,
 * сколько запросов он успел сделать и сколько раз получил отказ по лимиту.
 */
export const finishSyncRun = async (
  runId: string,
  status: SyncStatus,
  counters: SyncRunCounters,
  error: string | null,
): Promise<void> => {
  await db.$executeRaw`
    UPDATE xb.sync_runs
       SET "status"        = ${status}::xb.sync_status,
           "finished_at"   = now(),
           "requests"      = ${counters.requests},
           "rate_limited"  = ${counters.rateLimited},
           "items_seen"    = ${counters.itemsSeen},
           "items_written" = ${counters.itemsWritten},
           "error"         = ${error}
     WHERE "id" = ${runId}::uuid
  `;
};
