-- Где полный прогон истории заказов парка (issue #317): журнал суток за диапазон.
--
-- Диапазон приходит переменными psql `from` и `to` — их подставляют цели
-- `fleet-history-status` и `prod-fleet-history-status`. Схема указывается явно
-- (docs/decisions.md → «В сыром SQL схема указывается явно»).
--
-- Отчёт, а не проверка: ненулевого кода возврата не бывает. Прогон закончен, когда
-- «не закрыто» и «не начато» — нули.

\pset border 2

\echo '== Сутки диапазона =='
WITH range_days AS (
  SELECT day::date AS park_day
    FROM generate_series(:'from'::date, :'to'::date, interval '1 day') AS day
)
SELECT :'from' || ' — ' || :'to' AS "диапазон",
       count(*) AS "суток",
       count(*) FILTER (WHERE journal."finished_at" IS NOT NULL) AS "закрыто",
       count(*) FILTER (WHERE journal."park_day" IS NOT NULL AND journal."finished_at" IS NULL) AS "не закрыто",
       count(*) FILTER (WHERE journal."park_day" IS NULL) AS "не начато",
       count(*) FILTER (WHERE journal."finished_at" IS NOT NULL AND journal."orders" = 0) AS "закрыто пустыми",
       coalesce(sum(journal."orders") FILTER (WHERE journal."finished_at" IS NOT NULL), 0) AS "заказов в закрытых",
       max(journal."park_day") FILTER (WHERE journal."finished_at" IS NOT NULL) AS "последние закрытые сутки",
       max(journal."finished_at") AS "последнее закрытие"
  FROM range_days
  LEFT JOIN xb.fleet_order_history_days AS journal ON journal."park_day" = range_days.park_day;

\echo ''
\echo '== Начаты и не закрыты =='
-- Частичные итоги оборванного обхода: следующий запуск пройдёт эти сутки заново.
SELECT "park_day" AS "сутки",
       "orders" AS "заказов (частично)",
       "pages" AS "страниц",
       "rate_limited" AS "429",
       "started_at" AS "начат"
  FROM xb.fleet_order_history_days
 WHERE "finished_at" IS NULL
   AND "park_day" BETWEEN :'from'::date AND :'to'::date
 ORDER BY "park_day";

\echo ''
\echo '== Последние закрытые =='
SELECT "park_day" AS "сутки",
       "orders" AS "заказов",
       "complete",
       "pages" AS "страниц",
       "rate_limited" AS "429",
       "finished_at" - "started_at" AS "длительность",
       "finished_at" AS "закрыт"
  FROM xb.fleet_order_history_days
 WHERE "finished_at" IS NOT NULL
   AND "park_day" BETWEEN :'from'::date AND :'to'::date
 ORDER BY "finished_at" DESC
 LIMIT 5;

\echo ''
\echo '== Таблица истории целиком =='
SELECT count(*) AS "строк",
       pg_size_pretty(pg_total_relation_size('xb.fleet_order_history')) AS "размер с индексами"
  FROM xb.fleet_order_history;
