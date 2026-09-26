import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';
import { COMPLETED_TRIP_STATUS } from '#server/utils/tripStatus';

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
 * Демо-водитель не входит ни в одно число (docs/decisions.md → «Демо не входит ни в одну общую
 * цифру»): его ручные поездки (issue #213) пишутся в ту же `xb.trips` и начисляются тем же
 * переводом `trip`, но Fleet API их не приносил, и свод синхронизации они бы только врали.
 * Поездки отсекаются по владельцу профиля, начисления — по владельцу счёта-получателя.
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

/**
 * Профиль и живой владелец поездки — продолжение `JOIN` после `xb.trips AS trip`. Соединением,
 * а не `EXISTS`: «вне программы» берёт человека из того же профиля.
 */
const LIVE_TRIP_OWNER = Prisma.sql`
  xb.park_profiles AS profile
    ON profile."profile_id" = trip."profile_id"
  JOIN xb.persons AS owner
    ON owner."id" = profile."person_id"
   AND NOT owner."is_demo"
`;

export const readSyncPeriodCounts = async (from: Date): Promise<SyncPeriodCounts> => {
  const since = from.toISOString();

  const rows = await db.$queryRaw<SyncPeriodCounts[]>`
    SELECT (SELECT count(*)::int
              FROM xb.trips AS trip
              JOIN ${LIVE_TRIP_OWNER}
             WHERE trip."ended_at" >= ${since}::timestamptz)                AS "trips",
           (SELECT count(*)::int
              FROM xb.trips AS trip
              JOIN ${LIVE_TRIP_OWNER}
             WHERE trip."ended_at" >= ${since}::timestamptz
               AND trip."status" = ${COMPLETED_TRIP_STATUS})                AS "tripsCompleted",
           (SELECT count(*)::int
              FROM xb.point_transfers AS transfer
              JOIN xb.accounts AS account
                ON account."id" = transfer."to_account_id"
              JOIN xb.persons AS person
                ON person."id" = account."person_id"
               AND NOT person."is_demo"
             WHERE transfer."reason" = 'trip'::xb.point_reason
               AND transfer."occurred_at" >= ${since}::timestamptz)         AS "awards",
           (SELECT count(*)::int
              FROM xb.trips AS trip
              JOIN ${LIVE_TRIP_OWNER}
              LEFT JOIN xb.person_settings AS settings
                ON settings."person_id" = profile."person_id"
             WHERE trip."ended_at" >= ${since}::timestamptz
               AND trip."status" = ${COMPLETED_TRIP_STATUS}
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
           (SELECT min(trip."ended_at")
              FROM xb.trips AS trip
              JOIN ${LIVE_TRIP_OWNER})                  AS "tripsSince"
  `;

  return rows[0] ?? { journalSince: null, tripsSince: null };
};
