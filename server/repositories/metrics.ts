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
          FROM ${completedTripsSql(windowStart, windowEnd)} AS completed
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
