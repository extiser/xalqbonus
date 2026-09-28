import { db } from '#server/db';
import type { SyncKind } from '#server/generated/prisma/enums';

/**
 * Отметка синхронизации. Двигается только после успешного прогона — её сдвиг при неуспехе
 * породил в старом боте счётчик дней простоя и скрыл отказы по лимиту (docs/decisions.md).
 */

export type SyncStateRow = {
  kind: SyncKind;
  watermark: Date | null;
  /** Границы прохода догона. Заполнены только у `orders_catchup`. */
  passFrom: Date | null;
  passTo: Date | null;
  updatedAt: Date;
};

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

/**
 * Начинает новый проход догона: ставит его границы и позицию на его начало.
 *
 * Одной записью, а не двумя: границы без позиции или позиция без границ читались бы
 * следующим запуском как проход, которого не было. Прогона за этим нет, поэтому
 * `last_run_id` пуст — так же, как у отметки, поставленной переносом.
 */
export const startCatchupPass = async (passFrom: Date, passTo: Date): Promise<void> => {
  await db.$executeRaw`
    INSERT INTO xb.sync_state ("kind", "watermark", "pass_from", "pass_to", "last_run_id", "updated_at")
    VALUES (
      'orders_catchup'::xb.sync_kind,
      ${passFrom.toISOString()}::timestamptz,
      ${passFrom.toISOString()}::timestamptz,
      ${passTo.toISOString()}::timestamptz,
      NULL,
      now()
    )
    ON CONFLICT ("kind") DO UPDATE SET
      "watermark"   = EXCLUDED."watermark",
      "pass_from"   = EXCLUDED."pass_from",
      "pass_to"     = EXCLUDED."pass_to",
      "last_run_id" = NULL,
      "updated_at"  = now()
  `;
};

export const readSyncState = async (kind: SyncKind): Promise<SyncStateRow | null> => {
  const rows = await db.$queryRaw<SyncStateRow[]>`
    SELECT "kind",
           "watermark",
           "pass_from"  AS "passFrom",
           "pass_to"    AS "passTo",
           "updated_at" AS "updatedAt"
      FROM xb.sync_state
     WHERE "kind" = ${kind}::xb.sync_kind
  `;

  return rows[0] ?? null;
};

/**
 * Читает все отметки разом.
 *
 * Экран наблюдаемости показывает виды прогона списком, и запрашивать их по одному значило бы
 * четыре круговых обхода вместо одного ради трёх строк.
 */
export const readAllSyncStates = async (): Promise<SyncStateRow[]> =>
  db.$queryRaw<SyncStateRow[]>`
    SELECT "kind",
           "watermark",
           "pass_from"  AS "passFrom",
           "pass_to"    AS "passTo",
           "updated_at" AS "updatedAt"
      FROM xb.sync_state
     ORDER BY "kind"
  `;
