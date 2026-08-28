import { db } from '#server/db';

/**
 * Свод синхронизации за период — по таблицам данных, а не по журналу прогонов.
 *
 * Почему не суммой счётчиков `xb.sync_run_orders`: счётчик прогона считает события этого
 * прогона, а не сущности. Окно живой синхронизации — одиннадцать минут при прогоне раз
 * в минуту, один и тот же заказ попадает в несколько прогонов подряд, и каждый из них
 * считает его заново. Сумма таких счётчиков и число заказов — величины разного смысла,
 * и насколько они разойдутся, зависит от ширины окна, интервала прогона и того, что
 * прогон успел записать раньше. Суточный замер 28.08.2026: «вне программы» 732 суммой
 * против 703 различных. Близость этих чисел ничего не гарантирует — она держится
 * на текущих настройках окна, а не на смысле счётчика, и с первой же правкой интервала
 * разъедется молча.
 *
 * Поэтому каждое число здесь — различные сущности по времени события:
 *
 *   - поездки — по `ended_at`, тому самому полю, по которому строится окно опроса;
 *   - начисления — по `occurred_at` журнала, а он равен времени завершения поездки,
 *     то есть считается по тому же времени, что и поездки, и сравним с ними;
 *   - вне программы — те же завершённые поездки, у чьего водителя нет строки участия;
 *   - пропущенное — по `first_seen_at`: сколько нового потеряно за период, а не сколько
 *     раз старое принесло окно.
 *
 * Счётчиков, которые различным подсчётом не берутся, здесь нет. «Уже начислено»
 * и «не разобрано» живут только в разборе отдельного прогона: там вопрос «что сделал
 * этот прогон», и ответ на него — именно события.
 */

export type SyncPeriodCounts = {
  trips: number;
  tripsCompleted: number;
  awards: number;
  /**
   * Завершённые поездки водителей, которых нет в программе.
   *
   * Реестр парка шире программы: участие — это строка `xb.person_settings`, и её
   * отсутствие штатно. Считается различными поездками через профиль и человека, а не
   * суммой счётчика прогонов.
   */
  outsideProgram: number;
  skipsFirstSeen: number;
  skipsUnresolved: number;
  runs: number;
  runsFailed: number;
};

/** Единственный статус поездки, за который начисляется балл. Значение словаря Fleet API. */
const COMPLETED_STATUS = 'complete';

export const readSyncPeriodCounts = async (from: Date): Promise<SyncPeriodCounts> => {
  const since = from.toISOString();

  const rows = await db.$queryRaw<SyncPeriodCounts[]>`
    SELECT (SELECT count(*)::int
              FROM xb.trips
             WHERE "ended_at" >= ${since}::timestamptz)                     AS "trips",
           (SELECT count(*)::int
              FROM xb.trips
             WHERE "ended_at" >= ${since}::timestamptz
               AND "status" = ${COMPLETED_STATUS})                          AS "tripsCompleted",
           (SELECT count(*)::int
              FROM xb.point_transfers
             WHERE "reason" = 'trip'::xb.point_reason
               AND "occurred_at" >= ${since}::timestamptz)                  AS "awards",
           (SELECT count(*)::int
              FROM xb.trips AS trip
              JOIN xb.park_profiles AS profile
                ON profile."profile_id" = trip."profile_id"
              LEFT JOIN xb.person_settings AS settings
                ON settings."person_id" = profile."person_id"
             WHERE trip."ended_at" >= ${since}::timestamptz
               AND trip."status" = ${COMPLETED_STATUS}
               AND settings."person_id" IS NULL)                            AS "outsideProgram",
           (SELECT count(*)::int
              FROM xb.sync_skips
             WHERE "first_seen_at" >= ${since}::timestamptz)                AS "skipsFirstSeen",
           (SELECT count(*)::int
              FROM xb.sync_skips
             WHERE "first_seen_at" >= ${since}::timestamptz
               AND "resolved_at" IS NULL)                                   AS "skipsUnresolved",
           (SELECT count(*)::int
              FROM xb.sync_runs
             WHERE "started_at" >= ${since}::timestamptz)                   AS "runs",
           (SELECT count(*)::int
              FROM xb.sync_runs
             WHERE "started_at" >= ${since}::timestamptz
               AND "status" = 'failed'::xb.sync_status)                     AS "runsFailed"
  `;

  const row = rows[0];

  if (!row) {
    throw new Error('свод за период не посчитался: запрос не вернул строки');
  }

  return row;
};

/**
 * С какого момента у нас вообще есть данные — двумя границами, а не одной.
 *
 * Границы разные, и подменять их одной нельзя. Журнал прогонов начинается с первого
 * прогона, а поездки приезжают окном опроса — догоняющий прогон приносит неделю за раз,
 * и поездок в базе может оказаться заметно больше, чем журнала. Свод за неделю на суточной
 * истории поездок — та же неправда, ради которой подпись периода и заведена.
 */
export type SyncDataBoundaries = {
  /** Первый прогон в журнале: раньше него счётчики прогонов означают ноль, а не «не было». */
  journalSince: Date | null;
  /** Самая ранняя поездка по времени завершения: до неё считать поездки не по чему. */
  tripsSince: Date | null;
};

export const readSyncDataBoundaries = async (): Promise<SyncDataBoundaries> => {
  const rows = await db.$queryRaw<SyncDataBoundaries[]>`
    SELECT (SELECT min("started_at") FROM xb.sync_runs) AS "journalSince",
           (SELECT min("ended_at") FROM xb.trips)       AS "tripsSince"
  `;

  return rows[0] ?? { journalSince: null, tripsSince: null };
};
