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

/**
 * Заводит строку прогона.
 *
 * Нижняя граница окна может быть пустой: у полного обхода реестра окна нет вовсе —
 * он берёт всё, что знает парк, и подставлять ему выдуманную границу значило бы соврать
 * в журнале.
 */
export const startSyncRun = async (
  kind: SyncKind,
  windowFrom: Date | null,
  windowTo: Date | null,
): Promise<string> => {
  const rows = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO xb.sync_runs ("kind", "status", "window_from", "window_to")
    VALUES (
      ${kind}::xb.sync_kind,
      'running'::xb.sync_status,
      ${windowFrom?.toISOString() ?? null}::timestamptz,
      ${windowTo?.toISOString() ?? null}::timestamptz
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

/**
 * Поправляет верхнюю границу окна уже заведённого прогона.
 *
 * Нужна ровно одному случаю: инкрементальный прогон профилей ужимает окно по промеру
 * `total`, если изменившихся в нём больше, чем берётся разрешённой глубиной offset.
 * Строка прогона заводится до промера — иначе промер шёл бы вне журнала, — и после
 * ужатия обязана показывать то, что реально спрашивали у API, а не то, что собирались.
 *
 * Журнал, в котором `window_to` не равен фактической границе фильтра, хуже отсутствующего:
 * по нему будут сверять, за какой отрезок времени мы видели парк.
 */
export const narrowSyncRunWindow = async (runId: string, windowTo: Date): Promise<void> => {
  await db.$executeRaw`
    UPDATE xb.sync_runs
       SET "window_to" = ${windowTo.toISOString()}::timestamptz
     WHERE "id" = ${runId}::uuid
  `;
};

/**
 * Закрывает прогоны, оставшиеся в состоянии `running` дольше положенного.
 *
 * Зовётся при старте воркера. Прогон закрывает свою строку сам — успехом или отказом, —
 * но `SIGKILL` такой возможности не даёт: `docker stop` по таймауту и убийство по памяти
 * оставляют строку бежать вечно, и журнал прогонов начинает копить вечно бегущие строки.
 *
 * По возрасту, а не «все подряд»: рядом с воркером живёт разовый прогон командой
 * `make sync-orders`, и он законно идёт своей строкой в тот момент, когда воркер
 * перезапускается.
 */
export const failAbandonedRuns = async (startedBefore: Date): Promise<number> =>
  db.$executeRaw`
    UPDATE xb.sync_runs
       SET "status"      = 'failed'::xb.sync_status,
           "finished_at" = now(),
           "error"       = 'прогон оборван, воркер перезапущен'
     WHERE "status" = 'running'
       AND "started_at" < ${startedBefore.toISOString()}::timestamptz
  `;
