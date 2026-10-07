import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';
import type { PointReason } from '#server/generated/prisma/enums';
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

/**
 * Завершённые поездки с `ended_at` в окне `[windowStart, windowEnd)` — ряд из двух таблиц
 * по правилу шва выше: профиль и время окончания. Одним куском на файл: пересчёт таблицы
 * и выгрузка «Вне программы» (issue #373) обязаны видеть один и тот же ряд.
 */
const completedTripsSql = (windowStart: Prisma.Sql, windowEnd: Prisma.Sql): Prisma.Sql => Prisma.sql`
  (
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
  )
`;

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
 * Считает `metric_person_days` целиком заново за сутки `daysFrom`–`daysTo` включительно,
 * следом `metric_person_prior` — поездки до `daysFrom` по комиссиям парка — и закрывает прогон
 * итогами — одной транзакцией. Целиком, а не добавкой: история догружается задним числом,
 * и добавка пропустила бы дозакрытые сутки.
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
          FROM ${completedTripsSql(windowStart, windowEnd)} AS completed
          JOIN xb.park_profiles AS profile ON profile."profile_id" = completed."profile_id"
          JOIN xb.persons AS person ON person."id" = profile."person_id"
         WHERE NOT person."is_demo"
         GROUP BY 1, 2
      `;

      // Поездки до истории заказов — по комиссии парка: она идёт строкой на заказ и глубже
      // истории (docs/decisions.md → «Поток водителей — по календарному месяцу»). Комиссия без
      // профиля или с профилем вне реестра человека не даёт и пропускается.
      await transaction.$executeRaw`DELETE FROM xb.metric_person_prior`;
      await transaction.$executeRaw`
        INSERT INTO xb.metric_person_prior ("person_id", "last_day")
        SELECT profile."person_id",
               max(${parkDaySql(Prisma.sql`fee."event_at"`)})
          FROM xb.fleet_transactions AS fee
          JOIN xb.park_profiles AS profile ON profile."profile_id" = fee."driver_profile_id"
          JOIN xb.persons AS person ON person."id" = profile."person_id"
         WHERE fee."category_id" = 'partner_ride_fee'
           AND fee."event_at" < ${windowStart}
           AND NOT person."is_demo"
         GROUP BY profile."person_id"
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

/** Поток водителей за месяц `YYYY-MM` (issue #392) — люди, не учётные записи. */
export type DriverFlowMonthRow = {
  month: string;
  /** Разных людей со строками в месяце. */
  onLine: number;
  /** На линии, это первый месяц человека в таблице, и поездок до истории заказов у него нет. */
  newDrivers: number;
  /** На линии, в прошлом месяце строк нет, раньше есть — или есть поездки до истории заказов. */
  returned: number;
  /** На линии в прошлом месяце, в этом строк нет. */
  left: number;
};

/**
 * Поток водителей по каждому месяцу с `fromMonth` по `toMonth` включительно (`YYYY-MM`)
 * из готовой таблицы (docs/decisions.md → «Поток водителей — по календарному месяцу»).
 *
 * Месяцы людей берутся по всей таблице до конца `toMonth`, а не только по диапазону: «новый»
 * и «вернулся» смотрят всю историю до месяца. Соседние месяцы человека — `lag` и `lead`:
 * нет прошлого — новый, прошлый раньше M−1 — вернулся, следующего после M−1 нет или он
 * позже M — ушёл в M.
 *
 * Поездки до истории заказов (`metric_person_prior`) дают человеку месяц своих последних суток
 * как прошлый: он участвует в `lag`, и возврат становится «вернулся», а не «новый». Месяцем
 * потока он не бывает — ни «на линии», ни «ушли»: месяцы потока — только по истории заказов.
 *
 * Первое число месяца — вычитанием дня месяца, а месяцы ряда — от `timestamp` без зоны:
 * у даты `date_trunc` и `generate_series` приводят её к моменту в зоне сеанса.
 */
export const readDriverFlowByMonth = async (fromMonth: string, toMonth: string): Promise<DriverFlowMonthRow[]> =>
  db.$queryRaw<DriverFlowMonthRow[]>`
    WITH person_months AS (
           SELECT DISTINCT person_day."person_id",
                  person_day."day" - (extract(day FROM person_day."day")::int - 1) AS "month",
                  false AS "prior"
             FROM xb.metric_person_days AS person_day
            WHERE person_day."day" < (${`${toMonth}-01`}::timestamp + interval '1 month')::date
           UNION ALL
           SELECT prior_trips."person_id",
                  prior_trips."last_day" - (extract(day FROM prior_trips."last_day")::int - 1) AS "month",
                  true AS "prior"
             FROM xb.metric_person_prior AS prior_trips
         ),
         neighbours AS (
           SELECT person_month."month",
                  person_month."prior",
                  lag(person_month."month") OVER person_history  AS "previous",
                  lead(person_month."month") OVER person_history AS "next"
             FROM person_months AS person_month
           WINDOW person_history AS (PARTITION BY person_month."person_id" ORDER BY person_month."month")
         ),
         months AS (
           SELECT series."month"::date                              AS "month",
                  (series."month" - interval '1 month')::date        AS "previous_month"
             FROM generate_series(
                    ${`${fromMonth}-01`}::timestamp,
                    ${`${toMonth}-01`}::timestamp,
                    interval '1 month'
                  ) AS series("month")
         )
    SELECT to_char(months."month", 'YYYY-MM') AS "month",
           count(*) FILTER (WHERE neighbour."month" = months."month")::int AS "onLine",
           count(*) FILTER (
             WHERE neighbour."month" = months."month" AND neighbour."previous" IS NULL
           )::int AS "newDrivers",
           count(*) FILTER (
             WHERE neighbour."month" = months."month" AND neighbour."previous" < months."previous_month"
           )::int AS "returned",
           count(*) FILTER (
             WHERE neighbour."month" = months."previous_month"
               AND (neighbour."next" IS NULL OR neighbour."next" > months."month")
           )::int AS "left"
      FROM months
      LEFT JOIN neighbours AS neighbour
             ON neighbour."month" IN (months."month", months."previous_month")
            AND NOT neighbour."prior"
     GROUP BY months."month"
     ORDER BY months."month"
  `;

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

/**
 * Баллы и программа на вкладке «Глубина» (issue #373). Считаются при открытии экрана прямо
 * из журнала: он маленький и полный по построению, ночного пересчёта у баллов нет.
 *
 * Границы — днями `YYYY-MM-DD`, начало суток по Ташкенту (`parkDayStartSql`); время перевода —
 * `occurred_at`. Демо-люди не входят: перевод считается, когда его водительская сторона —
 * не демо.
 */

/**
 * Какие переводы — выдача, а какие — трата. Определения живут в сервисе метрик
 * (`server/services/metrics/pointFlows.ts`), здесь только их применение.
 */
export type PointFlowReasons = {
  /** На счёт водителя — выдача. */
  issued: readonly PointReason[];
  /** Со счёта водителя — вычитается из выдачи. */
  issuedBack: readonly PointReason[];
  /** Со счёта водителя — трата. */
  spent: readonly PointReason[];
  /** На счёт водителя — вычитается из траты. */
  spentBack: readonly PointReason[];
};

/**
 * Переводы окна `[windowStart, windowEnd)` строкой на перевод: момент, вклад в выдачу
 * и вклад в трату со знаком. `receiver` и `payer` — не демо-водитель на своей стороне
 * перевода, иначе пусто.
 */
const pointFlowsSql = (reasons: PointFlowReasons, windowStart: Prisma.Sql, windowEnd: Prisma.Sql): Prisma.Sql => {
  const allReasons = [...reasons.issued, ...reasons.issuedBack, ...reasons.spent, ...reasons.spentBack];

  return Prisma.sql`
    (
      SELECT transfer."occurred_at",
             CASE
               WHEN receiver."id" IS NOT NULL AND transfer."reason"::text = ANY(${[...reasons.issued]}::text[])
                 THEN transfer."amount"
               WHEN payer."id" IS NOT NULL AND transfer."reason"::text = ANY(${[...reasons.issuedBack]}::text[])
                 THEN -transfer."amount"
               ELSE 0
             END AS "issued",
             CASE
               WHEN payer."id" IS NOT NULL AND transfer."reason"::text = ANY(${[...reasons.spent]}::text[])
                 THEN transfer."amount"
               WHEN receiver."id" IS NOT NULL AND transfer."reason"::text = ANY(${[...reasons.spentBack]}::text[])
                 THEN -transfer."amount"
               ELSE 0
             END AS "spent"
        FROM xb.point_transfers AS transfer
        LEFT JOIN xb.accounts AS receiver_account
               ON receiver_account."id" = transfer."to_account_id" AND receiver_account."type" = 'driver'
        LEFT JOIN xb.persons AS receiver
               ON receiver."id" = receiver_account."person_id" AND NOT receiver."is_demo"
        LEFT JOIN xb.accounts AS payer_account
               ON payer_account."id" = transfer."from_account_id" AND payer_account."type" = 'driver'
        LEFT JOIN xb.persons AS payer
               ON payer."id" = payer_account."person_id" AND NOT payer."is_demo"
       WHERE transfer."reason"::text = ANY(${allReasons}::text[])
         AND transfer."occurred_at" >= ${windowStart}
         AND transfer."occurred_at" < ${windowEnd}
    )
  `;
};

export type PointFlowTotals = { issued: number; spent: number };

/** Выдано и потрачено за сутки `from`–`to` включительно. */
export const sumPointFlows = async (
  reasons: PointFlowReasons,
  from: string,
  to: string,
): Promise<PointFlowTotals> => {
  const windowStart = parkDayStartSql(Prisma.sql`${from}`);
  const windowEnd = parkDayStartSql(Prisma.sql`${to}::date + 1`);
  const rows = await db.$queryRaw<{ issued: bigint; spent: bigint }[]>`
    SELECT coalesce(sum(flow."issued"), 0)::bigint AS "issued",
           coalesce(sum(flow."spent"), 0)::bigint  AS "spent"
      FROM ${pointFlowsSql(reasons, windowStart, windowEnd)} AS flow
  `;
  const row = rows[0];

  return { issued: Number(row?.issued ?? 0n), spent: Number(row?.spent ?? 0n) };
};

export type PointFlowWeek = PointFlowTotals & { weekStart: string };

/**
 * Выдано и потрачено по неделям с понедельника `fromWeek` по воскресенье `toWeek`
 * включительно. Неделя без переводов строки не даёт — её дорисовывает сервис.
 *
 * Понедельник — вычитанием дня недели, а не `date_trunc('week', …)`: у даты тот приводится
 * к моменту в зоне сеанса, и неделя зависела бы от настройки соединения.
 */
export const sumPointFlowsByWeek = async (
  reasons: PointFlowReasons,
  fromWeek: string,
  toWeek: string,
): Promise<PointFlowWeek[]> => {
  const windowStart = parkDayStartSql(Prisma.sql`${fromWeek}`);
  const windowEnd = parkDayStartSql(Prisma.sql`${toWeek}::date + 7`);
  const rows = await db.$queryRaw<{ weekStart: string; issued: bigint; spent: bigint }[]>`
    SELECT to_char(dated."day" - (extract(isodow FROM dated."day")::int - 1), 'YYYY-MM-DD') AS "weekStart",
           sum(dated."issued")::bigint AS "issued",
           sum(dated."spent")::bigint  AS "spent"
      FROM (
            SELECT ${parkDaySql(Prisma.sql`flow."occurred_at"`)} AS "day", flow."issued", flow."spent"
              FROM ${pointFlowsSql(reasons, windowStart, windowEnd)} AS flow
           ) AS dated
     GROUP BY 1
     ORDER BY 1
  `;

  return rows.map((row) => ({ weekStart: row.weekStart, issued: Number(row.issued), spent: Number(row.spent) }));
};

/**
 * Сутки первого перевода не демо-водителя в журнале — с них начинается график по неделям.
 * `null` — переводов ещё не было.
 */
export const readFirstDriverTransferDay = async (): Promise<string | null> => {
  const rows = await db.$queryRaw<{ day: string | null }[]>`
    SELECT to_char(${parkDaySql(Prisma.sql`min(transfer."occurred_at")`)}, 'YYYY-MM-DD') AS "day"
      FROM xb.point_transfers AS transfer
      JOIN xb.accounts AS account
        ON account."id" IN (transfer."from_account_id", transfer."to_account_id") AND account."type" = 'driver'
      JOIN xb.persons AS person ON person."id" = account."person_id"
     WHERE NOT person."is_demo"
  `;

  return rows[0]?.day ?? null;
};

/**
 * Долг по баллам перед началом суток `day`: сумма плюсовых балансов не демо-водителей
 * на этот момент. Баланс на момент — сумма проводок его переводов с `occurred_at` раньше
 * момента. Минусовые счета — долг водителей из старой базы — не вычитаются.
 */
export const readPointDebtBefore = async (day: string): Promise<number> => {
  const moment = parkDayStartSql(Prisma.sql`${day}`);
  const rows = await db.$queryRaw<{ total: bigint }[]>`
    SELECT coalesce(sum(balances."balance"), 0)::bigint AS "total"
      FROM (
            SELECT entry."account_id", sum(entry."delta") AS "balance"
              FROM xb.point_entries AS entry
              JOIN xb.point_transfers AS transfer ON transfer."id" = entry."transfer_id"
              JOIN xb.accounts AS account ON account."id" = entry."account_id" AND account."type" = 'driver'
              JOIN xb.persons AS person ON person."id" = account."person_id"
             WHERE NOT person."is_demo"
               AND transfer."occurred_at" < ${moment}
             GROUP BY entry."account_id"
           ) AS balances
     WHERE balances."balance" > 0
  `;

  return Number(rows[0]?.total ?? 0n);
};

/** Из чего складывается цена балла: только строки со снимком себестоимости. */
export type PointCostTotals = {
  /** Себестоимость выданного, сум: `Σ quantity × unit_cost`. */
  cost: number;
  /** Баллы за него: `Σ quantity × unit_points`. */
  points: number;
  /** Заказов хотя бы с одной строкой со снимком. */
  orders: number;
  /** Строк без снимка — в цену не вошли. */
  unpricedLines: number;
};

/**
 * Выданные за баллы заказы не демо-людей, выданные раньше начала суток `day`, — за всё время.
 * Себестоимость — снимок строки заказа (issue #372), а не текущий каталог.
 */
export const readPointCostTotalsBefore = async (day: string): Promise<PointCostTotals> => {
  const moment = parkDayStartSql(Prisma.sql`${day}`);
  const rows = await db.$queryRaw<{ cost: bigint; points: bigint; orders: number; unpricedLines: number }[]>`
    SELECT coalesce(sum(item."quantity"::bigint * item."unit_cost") FILTER (WHERE item."unit_cost" IS NOT NULL), 0)::bigint
             AS "cost",
           coalesce(sum(item."quantity"::bigint * item."unit_points") FILTER (WHERE item."unit_cost" IS NOT NULL), 0)::bigint
             AS "points",
           count(DISTINCT placed."id") FILTER (WHERE item."unit_cost" IS NOT NULL)::int AS "orders",
           count(*) FILTER (WHERE item."unit_cost" IS NULL)::int AS "unpricedLines"
      FROM xb.orders AS placed
      JOIN xb.order_items AS item ON item."order_id" = placed."id"
      JOIN xb.persons AS person ON person."id" = placed."person_id"
     WHERE placed."payment" = 'points'
       AND placed."status" = 'issued'
       AND placed."issued_at" < ${moment}
       AND NOT person."is_demo"
  `;
  const row = rows[0];

  return {
    cost: Number(row?.cost ?? 0n),
    points: Number(row?.points ?? 0n),
    orders: row?.orders ?? 0,
    unpricedLines: row?.unpricedLines ?? 0,
  };
};

/**
 * Люди на линии за сутки `from`–`to` из готовой таблицы и их поездки, с отметкой «вне программы»:
 * ни одной привязки Telegram с `linked_at` раньше конца периода. Закрытая привязка тоже
 * в счёт: участник — хоть раз привязал (docs/decisions.md → «Баллы в метриках дашборда»).
 * Демо-людей в таблице нет по построению.
 */
const periodPeopleSql = (from: string, to: string): Prisma.Sql => {
  const periodEnd = parkDayStartSql(Prisma.sql`${to}::date + 1`);

  return Prisma.sql`
    (
      SELECT person_day."person_id",
             sum(person_day."trips")::int AS "trips",
             NOT EXISTS (
               SELECT 1 FROM xb.telegram_links AS link
                WHERE link."person_id" = person_day."person_id" AND link."linked_at" < ${periodEnd}
             ) AS "outside"
        FROM xb.metric_person_days AS person_day
       WHERE person_day."day" BETWEEN ${from}::date AND ${to}::date
       GROUP BY person_day."person_id"
    )
  `;
};

export type OutsideProgramTotals = {
  drivers: number;
  driversOnLine: number;
  trips: number;
  allTrips: number;
};

export const readOutsideProgramTotals = async (from: string, to: string): Promise<OutsideProgramTotals> => {
  const rows = await db.$queryRaw<OutsideProgramTotals[]>`
    SELECT count(*) FILTER (WHERE people."outside")::int                   AS "drivers",
           count(*)::int                                                  AS "driversOnLine",
           coalesce(sum(people."trips") FILTER (WHERE people."outside"), 0)::int AS "trips",
           coalesce(sum(people."trips"), 0)::int                          AS "allTrips"
      FROM ${periodPeopleSql(from, to)} AS people
  `;

  return rows[0] ?? { drivers: 0, driversOnLine: 0, trips: 0, allTrips: 0 };
};

export type OutsideProgramPersonRow = {
  personId: string;
  trips: number;
  /** Последняя поездка периода. Пусто — поездка есть в таблице, а в ряду поездок её уже нет. */
  lastTripAt: Date | null;
  callsign: string | null;
  firstName: string | null;
  lastName: string | null;
  /** Незакрытые номера всех профилей человека через запятую; пустой E.164 — сырой номер. */
  phones: string | null;
};

/**
 * Водители вне программы за сутки `from`–`to`, по поездкам по убыванию. Позывной и имя —
 * из профиля, на котором последняя поездка периода: у человека с двумя учётками в парке
 * это та, на которой он ездит сейчас.
 */
export const listOutsideProgramPeople = async (from: string, to: string): Promise<OutsideProgramPersonRow[]> => {
  const windowStart = parkDayStartSql(Prisma.sql`${from}`);
  const windowEnd = parkDayStartSql(Prisma.sql`${to}::date + 1`);

  return db.$queryRaw<OutsideProgramPersonRow[]>`
    WITH outside AS (
           SELECT people."person_id", people."trips"
             FROM ${periodPeopleSql(from, to)} AS people
            WHERE people."outside"
         ),
         last_trip AS (
           SELECT DISTINCT ON (profile."person_id")
                  profile."person_id", profile."profile_id", completed."ended_at"
             FROM ${completedTripsSql(windowStart, windowEnd)} AS completed
             JOIN xb.park_profiles AS profile ON profile."profile_id" = completed."profile_id"
            WHERE profile."person_id" IN (SELECT "person_id" FROM outside)
            ORDER BY profile."person_id", completed."ended_at" DESC, profile."profile_id"
         )
    SELECT outside."person_id"   AS "personId",
           outside."trips",
           last_trip."ended_at"  AS "lastTripAt",
           profile."callsign",
           profile."first_name"  AS "firstName",
           profile."last_name"   AS "lastName",
           (
             -- Порядок побайтный: от сортировки базы он зависеть не должен.
             SELECT string_agg(
                      DISTINCT coalesce(nullif(phone."phone_e164", ''), phone."phone_raw") COLLATE "C", ', '
                      ORDER BY coalesce(nullif(phone."phone_e164", ''), phone."phone_raw") COLLATE "C"
                    )
               FROM xb.profile_phones AS phone
               JOIN xb.park_profiles AS owned ON owned."profile_id" = phone."profile_id"
              WHERE owned."person_id" = outside."person_id"
                AND phone."closed_at" IS NULL
           ) AS "phones"
      FROM outside
      LEFT JOIN last_trip ON last_trip."person_id" = outside."person_id"
      LEFT JOIN xb.park_profiles AS profile ON profile."profile_id" = last_trip."profile_id"
     ORDER BY outside."trips" DESC, last_trip."ended_at" DESC NULLS LAST, outside."person_id"
  `;
};

/**
 * Лидеры по поездкам и список тех, кого парк может потерять (issue #402). Всё — из готовой
 * таблицы `metric_person_days`; кто лидер, где норма и кто в какой группе, решает сервис
 * (`server/services/metrics/readLeaders.ts`), здесь только выборки.
 */

export type PersonTripsRow = { personId: string; trips: number };

/** Люди на линии за сутки `from`–`to` включительно и их поездки. */
export const listPersonTrips = async (from: string, to: string): Promise<PersonTripsRow[]> =>
  db.$queryRaw<PersonTripsRow[]>`
    SELECT person_day."person_id"          AS "personId",
           sum(person_day."trips")::int     AS "trips"
      FROM xb.metric_person_days AS person_day
     WHERE person_day."day" BETWEEN ${from}::date AND ${to}::date
     GROUP BY person_day."person_id"
  `;

export type PersonWeekTripsRow = {
  personId: string;
  /** Понедельник недели, `YYYY-MM-DD`. */
  weekStart: string;
  trips: number;
  /** Последние сутки недели с поездкой. */
  lastDay: string;
};

/**
 * Поездки этих людей по неделям с понедельника по воскресенье, сутки `from`–`to` включительно.
 * Неделя без поездок строки не даёт — её дополняет нулём сервис.
 *
 * Понедельник — вычитанием дня недели, как у `sumPointFlowsByWeek`: `date_trunc('week', …)`
 * у даты зависел бы от зоны сеанса.
 */
export const listPersonWeekTrips = async (
  personIds: readonly string[],
  from: string,
  to: string,
): Promise<PersonWeekTripsRow[]> =>
  db.$queryRaw<PersonWeekTripsRow[]>`
    SELECT person_day."person_id" AS "personId",
           to_char(person_day."day" - (extract(isodow FROM person_day."day")::int - 1), 'YYYY-MM-DD') AS "weekStart",
           sum(person_day."trips")::int                   AS "trips",
           to_char(max(person_day."day"), 'YYYY-MM-DD')   AS "lastDay"
      FROM xb.metric_person_days AS person_day
     WHERE person_day."person_id" = ANY(${[...personIds]}::uuid[])
       AND person_day."day" BETWEEN ${from}::date AND ${to}::date
     GROUP BY 1, 2
  `;

export type LeaderPersonRow = {
  personId: string;
  callsign: string | null;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  /** Незакрытые номера всех профилей человека через запятую; пустой E.164 — сырой номер. */
  phones: string | null;
  /** Есть привязка Telegram, открытая сейчас. */
  inProgram: boolean;
};

/**
 * Карточки людей списка лидеров: позывной и ФИО — из профиля с последней поездкой не позже
 * суток `lastDay` человека, как у `listOutsideProgramPeople`; телефоны — так же. Программа —
 * привязка Telegram, открытая сейчас, а не на выбранный месяц (docs/decisions.md → «Лидеры
 * по поездкам и список тех, кого парк может потерять»).
 */
export const listLeaderPeople = async (
  people: readonly { personId: string; lastDay: string }[],
): Promise<LeaderPersonRow[]> => {
  if (people.length === 0) {
    return [];
  }

  const days = people.map((person) => person.lastDay).sort();
  const windowStart = parkDayStartSql(Prisma.sql`${days[0]}`);
  const windowEnd = parkDayStartSql(Prisma.sql`${days.at(-1)}::date + 1`);

  return db.$queryRaw<LeaderPersonRow[]>`
    WITH people AS (
           SELECT entry."person_id", entry."last_day"
             FROM unnest(
                    ${people.map((person) => person.personId)}::uuid[],
                    ${people.map((person) => person.lastDay)}::date[]
                  ) AS entry("person_id", "last_day")
         ),
         last_trip AS (
           SELECT DISTINCT ON (profile."person_id")
                  profile."person_id", profile."profile_id"
             FROM ${completedTripsSql(windowStart, windowEnd)} AS completed
             JOIN xb.park_profiles AS profile ON profile."profile_id" = completed."profile_id"
             JOIN people ON people."person_id" = profile."person_id"
            WHERE completed."ended_at" < ${parkDayStartSql(Prisma.sql`people."last_day" + 1`)}
            ORDER BY profile."person_id", completed."ended_at" DESC, profile."profile_id"
         )
    SELECT people."person_id"    AS "personId",
           profile."callsign",
           profile."first_name"  AS "firstName",
           profile."last_name"   AS "lastName",
           profile."middle_name" AS "middleName",
           (
             -- Порядок побайтный: от сортировки базы он зависеть не должен.
             SELECT string_agg(
                      DISTINCT coalesce(nullif(phone."phone_e164", ''), phone."phone_raw") COLLATE "C", ', '
                      ORDER BY coalesce(nullif(phone."phone_e164", ''), phone."phone_raw") COLLATE "C"
                    )
               FROM xb.profile_phones AS phone
               JOIN xb.park_profiles AS owned ON owned."profile_id" = phone."profile_id"
              WHERE owned."person_id" = people."person_id"
                AND phone."closed_at" IS NULL
           ) AS "phones",
           EXISTS (
             SELECT 1 FROM xb.telegram_links AS link
              WHERE link."person_id" = people."person_id" AND link."closed_at" IS NULL
           ) AS "inProgram"
      FROM people
      LEFT JOIN last_trip ON last_trip."person_id" = people."person_id"
      LEFT JOIN xb.park_profiles AS profile ON profile."profile_id" = last_trip."profile_id"
  `;
};

/**
 * Новички на «Глубине» (issue #407). Всё — из готовой таблицы `metric_person_days`; кто новичок,
 * чьё окно прошло и как сложить кривую, решает сервис (`server/services/metrics/readNewcomers.ts`),
 * здесь только выборки.
 *
 * Новичок месяца X — человек, чьи самые ранние сутки в таблице приходятся на X и у кого нет поездок
 * до истории заказов в `metric_person_prior` (docs/decisions.md → «Новички на дашборде»). Самые
 * ранние — по всей таблице до конца нужного периода: первая поездка смотрит всю историю, а не
 * только месяц. Первое число месяца — вычитанием дня месяца, как
 * у `readDriverFlowByMonth`: `date_trunc` у даты приводит её к моменту в зоне сеанса.
 */

export type NewcomerCohortMonthRow = {
  /** Месяц набора `YYYY-MM`. */
  cohortMonth: string;
  /** Месяц `YYYY-MM`, в котором ездили; равен месяцу набора — это весь набор. */
  month: string;
  /** Разных людей набора с поездкой в этом месяце. */
  drivers: number;
};

/**
 * Наборы с `fromMonth` по `toMonth` включительно и сколько людей каждого ездило в каждом месяце
 * с месяца набора по `toDay`. Месяц без единого ездившего строки не даёт.
 */
export const listNewcomerCohortMonths = async (
  fromMonth: string,
  toMonth: string,
  toDay: string,
): Promise<NewcomerCohortMonthRow[]> =>
  db.$queryRaw<NewcomerCohortMonthRow[]>`
    WITH firsts AS (
           SELECT person_day."person_id",
                  min(person_day."day") - (extract(day FROM min(person_day."day"))::int - 1) AS "cohort_month"
             FROM xb.metric_person_days AS person_day
            WHERE person_day."day" <= ${toDay}::date
              AND NOT EXISTS (
                    SELECT 1 FROM xb.metric_person_prior AS prior_trips
                     WHERE prior_trips."person_id" = person_day."person_id"
                  )
            GROUP BY person_day."person_id"
         ),
         cohort AS (
           SELECT firsts."person_id", firsts."cohort_month"
             FROM firsts
            WHERE firsts."cohort_month" BETWEEN ${`${fromMonth}-01`}::date AND ${`${toMonth}-01`}::date
         ),
         riding AS (
           SELECT DISTINCT person_day."person_id",
                  person_day."day" - (extract(day FROM person_day."day")::int - 1) AS "month"
             FROM xb.metric_person_days AS person_day
             JOIN cohort ON cohort."person_id" = person_day."person_id"
            WHERE person_day."day" BETWEEN ${`${fromMonth}-01`}::date AND ${toDay}::date
         )
    SELECT to_char(cohort."cohort_month", 'YYYY-MM') AS "cohortMonth",
           to_char(riding."month", 'YYYY-MM')        AS "month",
           count(*)::int                             AS "drivers"
      FROM cohort
      JOIN riding ON riding."person_id" = cohort."person_id"
     GROUP BY 1, 2
     ORDER BY 1, 2
  `;

export type NewcomerWindowRow = {
  personId: string;
  /** Сутки первой поездки, `YYYY-MM-DD`. */
  firstDay: string;
  /** Поездки за окно первых суток, не позже `asOfDay`. */
  windowTrips: number;
  /** Последние сутки с поездкой не позже `asOfDay`. */
  lastDay: string;
};

/**
 * Новички месяца `month` (`YYYY-MM`) на сутки `asOfDay`: первая поездка, поездки за `windowDays`
 * суток с неё и последняя поездка. Окно и прошло ли оно — правило сервиса; здесь только сумма.
 */
export const listNewcomerWindows = async (
  month: string,
  asOfDay: string,
  windowDays: number,
): Promise<NewcomerWindowRow[]> =>
  db.$queryRaw<NewcomerWindowRow[]>`
    WITH newcomers AS (
           SELECT person_day."person_id", min(person_day."day") AS "first_day"
             FROM xb.metric_person_days AS person_day
            WHERE person_day."day" <= ${asOfDay}::date
              AND NOT EXISTS (
                    SELECT 1 FROM xb.metric_person_prior AS prior_trips
                     WHERE prior_trips."person_id" = person_day."person_id"
                  )
            GROUP BY person_day."person_id"
           HAVING min(person_day."day") >= ${`${month}-01`}::date
              AND min(person_day."day") < (${`${month}-01`}::timestamp + interval '1 month')::date
         )
    SELECT newcomers."person_id"                        AS "personId",
           to_char(newcomers."first_day", 'YYYY-MM-DD') AS "firstDay",
           coalesce(sum(person_day."trips") FILTER (
             WHERE person_day."day" < newcomers."first_day" + ${windowDays}::int
           ), 0)::int                                   AS "windowTrips",
           to_char(max(person_day."day"), 'YYYY-MM-DD') AS "lastDay"
      FROM newcomers
      JOIN xb.metric_person_days AS person_day
        ON person_day."person_id" = newcomers."person_id"
       AND person_day."day" <= ${asOfDay}::date
     GROUP BY newcomers."person_id", newcomers."first_day"
  `;
