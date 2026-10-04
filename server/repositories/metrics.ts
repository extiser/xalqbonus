import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';
import { parkDaySql, parkDayStartSql } from '#server/utils/parkDaySql';

/**
 * Готовая таблица метрик дашборда и журнал её пересчёта (issue #371).
 *
 * Ряд поездок склеивается из двух таблиц по `order_id`: все строки `trips` и строки
 * `fleet_order_history`, чьего заказа в `trips` нет. Заказ, который есть в обеих, берётся
 * из `trips` целиком — со статусом, временем и профилем: она свежее (docs/decisions.md →
 * «Метрики дашборда: водитель — человек, поездка — из двух таблиц»). Шов от даты не зависит.
 *
 * Сутки — `parkDaySql`, календарные по Ташкенту. Демо-люди не входят. Схема в сыром SQL
 * указывается явно (docs/decisions.md → «В сыром SQL схема указывается явно»).
 *
 * Дни ходят строками `YYYY-MM-DD`: колонка `date` не знает ни времени, ни зоны.
 */

/**
 * Сколько ждать пересчёт целиком. Удаление и вставка всей таблицы на проде идут секунды или
 * минуты, а умолчание интерактивной транзакции Prisma — пять секунд.
 */
const RECOMPUTE_TRANSACTION_TIMEOUT_MS = 10 * 60 * 1_000;

export type MetricRecomputeResult = {
  rows: number;
  unattributedOrders: number;
};

/** Заводит строку прогона: упавший пересчёт остаётся в журнале видимым, а не пропадает. */
export const startMetricRecomputeRun = async (daysFrom: string, daysTo: string): Promise<string> => {
  const rows = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO xb.metric_recompute_runs ("days_from", "days_to")
    VALUES (${daysFrom}::date, ${daysTo}::date)
    RETURNING "id"
  `;
  const id = rows[0]?.id;

  if (id === undefined) {
    throw new Error('строка прогона пересчёта метрик не завелась');
  }

  return id;
};

/**
 * Считает `metric_person_days` целиком заново за сутки `daysFrom`–`daysTo` включительно
 * и закрывает прогон итогами — одной транзакцией. Целиком, а не добавкой: история догружается
 * задним числом, и добавка пропустила бы дозакрытые сутки.
 *
 * `DELETE`, а не `TRUNCATE`: тот взял бы на таблицу исключительную блокировку, и экран,
 * открытый посреди пересчёта, ждал бы его конца. Под `DELETE` он видит прежнюю таблицу.
 *
 * Окно — по моментам, а не по выражению суток: границы `ended_at` берут индекс обеих таблиц.
 */
export const replaceMetricPersonDays = async (
  runId: string,
  daysFrom: string,
  daysTo: string,
): Promise<MetricRecomputeResult> => {
  const windowStart = parkDayStartSql(Prisma.sql`${daysFrom}`);
  const windowEnd = parkDayStartSql(Prisma.sql`${daysTo}::date + 1`);

  return db.$transaction(
    async (transaction) => {
      await transaction.$executeRaw`DELETE FROM xb.metric_person_days`;

      // `GROUP BY 1, 2`, а не выражением: выражение суток несёт зону параметром, и повтор его
      // в группировке стал бы для Postgres другим выражением.
      const rows = await transaction.$executeRaw`
        INSERT INTO xb.metric_person_days ("day", "person_id", "trips")
        SELECT ${parkDaySql(Prisma.sql`completed."ended_at"`)} AS "day",
               profile."person_id",
               count(*)::int
          FROM (
                SELECT trip."profile_id", trip."ended_at"
                  FROM xb.trips AS trip
                 WHERE trip."status" = 'complete'
                   AND trip."ended_at" >= ${windowStart}
                   AND trip."ended_at" < ${windowEnd}
                UNION ALL
                SELECT history."profile_id", history."ended_at"
                  FROM xb.fleet_order_history AS history
                 WHERE history."status" = 'complete'
                   AND history."ended_at" >= ${windowStart}
                   AND history."ended_at" < ${windowEnd}
                   AND NOT EXISTS (
                         SELECT 1 FROM xb.trips AS trip WHERE trip."order_id" = history."order_id"
                       )
               ) AS completed
          JOIN xb.park_profiles AS profile ON profile."profile_id" = completed."profile_id"
          JOIN xb.persons AS person ON person."id" = profile."person_id"
         WHERE NOT person."is_demo"
         GROUP BY 1, 2
      `;

      // Заказ `trips` без профиля не бывает — внешний ключ; без человека остаётся только история.
      const unattributed = await transaction.$queryRaw<{ total: number }[]>`
        SELECT count(*)::int AS "total"
          FROM xb.fleet_order_history AS history
         WHERE history."status" = 'complete'
           AND history."ended_at" >= ${windowStart}
           AND history."ended_at" < ${windowEnd}
           AND NOT EXISTS (SELECT 1 FROM xb.trips AS trip WHERE trip."order_id" = history."order_id")
           AND NOT EXISTS (
                 SELECT 1 FROM xb.park_profiles AS profile WHERE profile."profile_id" = history."profile_id"
               )
      `;
      const unattributedOrders = unattributed[0]?.total ?? 0;

      await transaction.$executeRaw`
        UPDATE xb.metric_recompute_runs
           SET "finished_at" = now(),
               "rows" = ${rows}::int,
               "unattributed_orders" = ${unattributedOrders}::int
         WHERE "id" = ${runId}::uuid
      `;

      return { rows, unattributedOrders };
    },
    { timeout: RECOMPUTE_TRANSACTION_TIMEOUT_MS, maxWait: RECOMPUTE_TRANSACTION_TIMEOUT_MS },
  );
};

/** Закрывает прогон отказом: `finished_at` остаётся пустым, текст ошибки — в `error`. */
export const failMetricRecomputeRun = async (runId: string, error: string): Promise<void> => {
  await db.$executeRaw`
    UPDATE xb.metric_recompute_runs SET "error" = ${error} WHERE "id" = ${runId}::uuid
  `;
};

/** Когда кончился последний успешный пересчёт. `null` — успешных ещё не было. */
export const readLastMetricRecomputeAt = async (): Promise<Date | null> => {
  const run = await db.metricRecomputeRun.findFirst({
    where: { finishedAt: { not: null } },
    orderBy: { finishedAt: 'desc' },
    select: { finishedAt: true },
  });

  return run?.finishedAt ?? null;
};

/** Итоги таблицы за сутки `from`–`to` включительно — то, из чего собираются множители. */
export type MetricPeriodTotals = {
  /** Сумма поездок. */
  trips: number;
  /** Разных людей с поездкой. */
  drivers: number;
  /** Строк таблицы: пар «человек, сутки» с поездкой. */
  personDays: number;
};

export const readMetricPeriodTotals = async (from: string, to: string): Promise<MetricPeriodTotals> => {
  const rows = await db.$queryRaw<MetricPeriodTotals[]>`
    SELECT coalesce(sum("trips"), 0)::int    AS "trips",
           count(DISTINCT "person_id")::int AS "drivers",
           count(*)::int                    AS "personDays"
      FROM xb.metric_person_days
     WHERE "day" BETWEEN ${from}::date AND ${to}::date
  `;

  return rows[0] ?? { trips: 0, drivers: 0, personDays: 0 };
};

/**
 * Закрытые порции сбора истории (`fleet_order_history_days`, сутки по UTC) с `from` по `to`
 * включительно — днями `YYYY-MM-DD`. Незакрытая порция — обход прервался, и её заказы неполны.
 */
export const listClosedHistoryDays = async (from: string, to: string): Promise<string[]> => {
  const days = await db.fleetOrderHistoryDay.findMany({
    where: {
      parkDay: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
      finishedAt: { not: null },
    },
    select: { parkDay: true },
  });

  return days.map((day) => day.parkDay.toISOString().slice(0, 10));
};
