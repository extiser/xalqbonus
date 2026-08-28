import { db } from '#server/db';
import type { SyncSkipReason } from '#server/generated/prisma/enums';

/**
 * Пропущенное прогоном синхронизации: что именно не удалось записать или разобрать.
 *
 * Строка одна на пропущенное, а не на прогон. Перекрытие окон приносит один и тот же
 * заказ каждый прогон, и без уникальности по паре «причина + ссылка» таблица росла бы
 * линейно по времени, а вопрос «сколько потеряно» перестал бы иметь ответ. Повтор
 * увеличивает `times_seen` и двигает `last_seen_at`.
 *
 * `SAMPLE_LIMIT` сводки сюда не относится: он ограничивает лог и только лог. В базу едет
 * всё — иначе то, что за пятидесятым, не названо нигде и никогда.
 */

export type SyncSkipInput = {
  reason: SyncSkipReason;
  /** Идентификатор заказа либо строка `словарь=значение`. Персональных данных здесь нет. */
  reference: string;
  /** Имя недостающего поля, идентификатор профиля или имя словаря — по причине. */
  detail: string | null;
};

/**
 * Записывает пропущенное этого прогона.
 *
 * Ссылки схлопываются запросом, а не вызывающим кодом: страница, не разобравшаяся целиком,
 * даёт полсотни записей с одной и той же ссылкой `(без id)`, а вставка с повтором ключа
 * отбивается Postgres'ом целиком — «ON CONFLICT DO UPDATE не может тронуть строку дважды».
 *
 * `resolved_at` сбрасывается: пропущенное, увиденное снова, снова нерешённое.
 */
export const recordSyncSkips = async (runId: string, skips: readonly SyncSkipInput[]): Promise<void> => {
  if (skips.length === 0) {
    return;
  }

  await db.$executeRaw`
    INSERT INTO xb.sync_skips (
      "reason", "reference", "detail",
      "first_run_id", "last_run_id", "first_seen_at", "last_seen_at", "times_seen"
    )
    SELECT incoming."reason"::xb.sync_skip_reason,
           incoming."reference",
           min(incoming."detail"),
           ${runId}::uuid,
           ${runId}::uuid,
           now(),
           now(),
           1
      FROM unnest(
             ${skips.map((skip) => skip.reason)}::text[],
             ${skips.map((skip) => skip.reference)}::text[],
             ${skips.map((skip) => skip.detail)}::text[]
           ) AS incoming("reason", "reference", "detail")
     GROUP BY incoming."reason", incoming."reference"
        ON CONFLICT ("reason", "reference") DO UPDATE
       SET "times_seen"  = xb.sync_skips."times_seen" + 1,
           "last_seen_at" = now(),
           "last_run_id"  = EXCLUDED."last_run_id",
           "detail"       = COALESCE(EXCLUDED."detail", xb.sync_skips."detail"),
           "resolved_at"  = NULL
  `;
};

/**
 * Отмечает пропущенное решённым: заказ, за который прогон когда-то не смог зацепиться,
 * всё-таки записан — профиль появился в реестре, разбор удался.
 *
 * Это и есть разница между «что потеряно до сих пор» и «что когда-либо пропускалось».
 * Причины перечислены явно: `unknown_value` заказом не разрешается — незнакомое значение
 * чужого словаря закрывается тем, что мы его узнали, а не следующим прогоном.
 */
/**
 * Отмечает решёнными заказы, чей водитель наконец появился в реестре.
 *
 * Ссылка у такой строки — идентификатор заказа, а профиль лежит в `detail`: разрешает
 * их поэтому синхронизация профилей, а не заказов, и по профилю, а не по заказу. Ровно
 * ради этого `resolved_at` и заведён — список нерешённого обязан таять после того,
 * как реестр догнали, а не расти вечно.
 *
 * Сам заказ при этом ещё не записан: его перезапросит догоняющий прогон, пока он
 * не старше его окна. Строка означает «препятствие снято», а не «поездка в базе».
 */
export const resolveSkipsForProfiles = async (profileIds: readonly string[]): Promise<number> => {
  if (profileIds.length === 0) {
    return 0;
  }

  return db.$executeRaw`
    UPDATE xb.sync_skips
       SET "resolved_at" = now()
     WHERE "resolved_at" IS NULL
       AND "reason" = 'unknown_profile'::xb.sync_skip_reason
       AND "detail" = ANY(${[...profileIds]}::text[])
  `;
};

export const resolveSyncSkips = async (orderIds: readonly string[]): Promise<number> => {
  if (orderIds.length === 0) {
    return 0;
  }

  return db.$executeRaw`
    UPDATE xb.sync_skips
       SET "resolved_at" = now()
     WHERE "resolved_at" IS NULL
       AND "reason" = ANY(ARRAY['unknown_profile', 'malformed']::xb.sync_skip_reason[])
       AND "reference" = ANY(${[...orderIds]}::text[])
  `;
};

export type SyncSkipListRow = {
  reason: SyncSkipReason;
  reference: string;
  detail: string | null;
  timesSeen: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

/**
 * Нерешённое пропущенное, страницей.
 *
 * Порядок — по убыванию числа прогонов, которые его принесли: сверху то, что окно тащит
 * из раза в раз и не может записать. Решённое сюда не попадает вовсе — это и есть разница
 * между «что потеряно до сих пор» и «что когда-либо пропускалось».
 */
export const listUnresolvedSkips = async (
  limit: number,
  offset: number,
): Promise<SyncSkipListRow[]> =>
  db.$queryRaw<SyncSkipListRow[]>`
    SELECT "reason",
           "reference",
           "detail",
           "times_seen"    AS "timesSeen",
           "first_seen_at" AS "firstSeenAt",
           "last_seen_at"  AS "lastSeenAt"
      FROM xb.sync_skips
     WHERE "resolved_at" IS NULL
     ORDER BY "times_seen" DESC, "last_seen_at" DESC
     LIMIT ${limit} OFFSET ${offset}
  `;

export const countUnresolvedSkips = async (): Promise<number> => {
  const rows = await db.$queryRaw<{ total: number }[]>`
    SELECT count(*)::int AS "total" FROM xb.sync_skips WHERE "resolved_at" IS NULL
  `;

  return rows[0]?.total ?? 0;
};
