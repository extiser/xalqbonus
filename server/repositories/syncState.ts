import { db } from '#server/db';
import type { SyncKind } from '#server/generated/prisma/enums';

/**
 * Отметка синхронизации. Двигается только после успешного прогона — её сдвиг при неуспехе
 * породил в старом боте счётчик дней простоя и скрыл отказы по лимиту (docs/decisions.md).
 */

export type SyncStateRow = { kind: SyncKind; watermark: Date | null };

/**
 * Ставит отметку одному виду синхронизации, не трогая остальные.
 *
 * Именно «одному»: поездки не переносятся, и окно опроса заказов назначается этапом 3.
 * Отметка `orders`, выставленная заодно, означала бы, что всё до неё уже опрошено, —
 * тот же класс ошибки, что убил старого бота.
 */
export const setSyncWatermark = async (
  kind: SyncKind,
  watermark: Date,
  /** Прогон, поставивший отметку. Пусто у переноса: он не прогон синхронизации. */
  lastRunId: string | null = null,
): Promise<void> => {
  await db.$executeRaw`
    INSERT INTO xb.sync_state ("kind", "watermark", "last_run_id", "updated_at")
    VALUES (
      ${kind}::xb.sync_kind,
      ${watermark.toISOString()}::timestamptz,
      ${lastRunId}::uuid,
      now()
    )
    ON CONFLICT ("kind") DO UPDATE SET
      "watermark"   = EXCLUDED."watermark",
      "last_run_id" = EXCLUDED."last_run_id",
      "updated_at"  = now()
  `;
};

export const readSyncState = async (kind: SyncKind): Promise<SyncStateRow | null> => {
  const rows = await db.$queryRaw<SyncStateRow[]>`
    SELECT "kind", "watermark" FROM xb.sync_state WHERE "kind" = ${kind}::xb.sync_kind
  `;

  return rows[0] ?? null;
};
