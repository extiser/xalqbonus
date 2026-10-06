-- Сверка транзакций с историей заказов (issue #358): комиссия парка `partner_ride_fee`
-- против завершённых заказов, по суткам сбора UTC.
--
-- Берутся только сутки диапазона, закрытые в обоих журналах — `fleet_order_history_days`
-- и `fleet_transaction_days`: в незакрытых сутках расхождение говорило бы о недособранном,
-- а не о данных. Диапазон приходит переменными psql `from` и `to` — их подставляют цели
-- `fleet-transactions-check` и `prod-fleet-transactions-check`. Схема указывается явно
-- (docs/decisions.md → «В сыром SQL схема указывается явно»).
--
-- Пара «заказ — комиссия» ищется по `order_id` в любые сутки: комиссия за заказ,
-- закончившийся в 23:59, может лечь следующими сутками. Отчёт, а не проверка: ненулевого
-- кода возврата не бывает.

\pset border 2

\echo '== Сутки диапазона =='
SELECT :'from' || ' — ' || :'to' AS "диапазон",
       count(*) AS "суток",
       count(*) FILTER (WHERE orders_day."finished_at" IS NOT NULL AND transactions_day."finished_at" IS NOT NULL) AS "закрыто в обоих журналах",
       count(*) FILTER (WHERE orders_day."finished_at" IS NULL) AS "не закрыто в истории заказов",
       count(*) FILTER (WHERE transactions_day."finished_at" IS NULL) AS "не закрыто в транзакциях"
  FROM generate_series(:'from'::date, :'to'::date, interval '1 day') AS day
  LEFT JOIN xb.fleet_order_history_days AS orders_day ON orders_day."park_day" = day::date
  LEFT JOIN xb.fleet_transaction_days AS transactions_day ON transactions_day."park_day" = day::date;

\echo ''
\echo '== Заказы и комиссии по суткам =='
WITH days AS (
  SELECT transactions_day."park_day",
         transactions_day."park_day"::timestamp AT TIME ZONE 'UTC' AS day_from,
         (transactions_day."park_day" + 1)::timestamp AT TIME ZONE 'UTC' AS day_to
    FROM xb.fleet_transaction_days AS transactions_day
    JOIN xb.fleet_order_history_days AS orders_day ON orders_day."park_day" = transactions_day."park_day"
   WHERE transactions_day."finished_at" IS NOT NULL
     AND orders_day."finished_at" IS NOT NULL
     AND transactions_day."park_day" BETWEEN :'from'::date AND :'to'::date
),
orders_side AS (
  SELECT coalesce(days."park_day"::text, 'итого') AS row_key,
         count(*) AS completed,
         count(*) FILTER (
           WHERE EXISTS (
             SELECT 1
               FROM xb.fleet_transactions AS fee
              WHERE fee."order_id" = orders."order_id"
                AND fee."category_id" = 'partner_ride_fee'
           )
         ) AS completed_with_fee
    FROM days
    JOIN xb.fleet_order_history AS orders
      ON orders."status" = 'complete'
     AND orders."ended_at" >= days.day_from
     AND orders."ended_at" < days.day_to
   GROUP BY ROLLUP (days."park_day")
),
fees AS (
  SELECT days."park_day",
         orders."order_id" AS found_order_id,
         orders."status",
         extract(epoch FROM fee."event_at" - orders."ended_at") AS lag_sec
    FROM days
    JOIN xb.fleet_transactions AS fee
      ON fee."category_id" = 'partner_ride_fee'
     AND fee."event_at" >= days.day_from
     AND fee."event_at" < days.day_to
    LEFT JOIN xb.fleet_order_history AS orders ON orders."order_id" = fee."order_id"
),
fees_side AS (
  SELECT coalesce("park_day"::text, 'итого') AS row_key,
         count(*) AS fees,
         count(found_order_id) AS fees_found,
         count(found_order_id) FILTER (WHERE "status" <> 'complete') AS fees_found_not_complete,
         round(min(lag_sec)) AS lag_min,
         round(percentile_cont(0.5) WITHIN GROUP (ORDER BY lag_sec)::numeric) AS lag_median,
         round(max(lag_sec)) AS lag_max
    FROM fees
   GROUP BY ROLLUP ("park_day")
)
SELECT coalesce(orders_side.row_key, fees_side.row_key) AS "сутки UTC",
       coalesce(orders_side.completed, 0) AS "заказов complete",
       coalesce(orders_side.completed_with_fee, 0) AS "из них с комиссией",
       coalesce(fees_side.fees, 0) AS "комиссий",
       coalesce(fees_side.fees_found, 0) AS "из них нашли заказ",
       coalesce(fees_side.fees_found_not_complete, 0) AS "заказ не complete",
       fees_side.lag_min AS "лаг мин, с",
       fees_side.lag_median AS "лаг медиана, с",
       fees_side.lag_max AS "лаг макс, с"
  FROM orders_side
  FULL JOIN fees_side ON fees_side.row_key = orders_side.row_key
 ORDER BY coalesce(orders_side.row_key, fees_side.row_key) = 'итого',
          coalesce(orders_side.row_key, fees_side.row_key);

\echo ''
\echo '== Комиссии, нашедшие заказ не в статусе complete =='
SELECT orders."status" AS "статус заказа",
       count(*) AS "комиссий"
  FROM xb.fleet_transaction_days AS transactions_day
  JOIN xb.fleet_order_history_days AS orders_day ON orders_day."park_day" = transactions_day."park_day"
  JOIN xb.fleet_transactions AS fee
    ON fee."category_id" = 'partner_ride_fee'
   AND fee."event_at" >= transactions_day."park_day"::timestamp AT TIME ZONE 'UTC'
   AND fee."event_at" < (transactions_day."park_day" + 1)::timestamp AT TIME ZONE 'UTC'
  JOIN xb.fleet_order_history AS orders ON orders."order_id" = fee."order_id"
 WHERE transactions_day."finished_at" IS NOT NULL
   AND orders_day."finished_at" IS NOT NULL
   AND transactions_day."park_day" BETWEEN :'from'::date AND :'to'::date
   AND orders."status" <> 'complete'
 GROUP BY orders."status"
 ORDER BY count(*) DESC;
