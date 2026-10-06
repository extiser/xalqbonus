-- Где прогон истории транзакций парка (issue #358): журнал суток за диапазон.
--
-- Диапазон приходит переменными psql `from` и `to` — их подставляют цели
-- `fleet-transactions-status` и `prod-fleet-transactions-status`. Пустая граница — крайние
-- сутки журнала: без `from` — самые ранние, без `to` — самые поздние. Схема указывается явно
-- (docs/decisions.md → «В сыром SQL схема указывается явно»).
--
-- Отчёт, а не проверка: ненулевого кода возврата не бывает. Прогон закончен, когда
-- «не закрыто» и «не начато» — нули. «Не начато» здесь ради стыка: сутки между концом
-- прогона истории и включением живого сбора иначе выпали бы молча.

\pset border 2

SELECT coalesce(nullif(:'from', '')::date, (SELECT min("park_day") FROM xb.fleet_transaction_days), current_date) AS range_from,
       coalesce(nullif(:'to', '')::date, (SELECT max("park_day") FROM xb.fleet_transaction_days), current_date) AS range_to
\gset

\echo '== Сутки диапазона =='
WITH range_days AS (
  SELECT day::date AS park_day
    FROM generate_series(:'range_from'::date, :'range_to'::date, interval '1 day') AS day
)
SELECT :'range_from' || ' — ' || :'range_to' AS "диапазон",
       count(*) AS "суток",
       count(*) FILTER (WHERE journal."finished_at" IS NOT NULL) AS "закрыто",
       count(*) FILTER (WHERE journal."park_day" IS NOT NULL AND journal."finished_at" IS NULL) AS "не закрыто",
       count(*) FILTER (WHERE journal."park_day" IS NULL) AS "не начато",
       count(*) FILTER (WHERE journal."finished_at" IS NOT NULL AND journal."transactions" = 0) AS "закрыто пустыми",
       coalesce(sum(journal."transactions") FILTER (WHERE journal."finished_at" IS NOT NULL), 0) AS "транзакций в закрытых",
       max(journal."park_day") FILTER (WHERE journal."finished_at" IS NOT NULL) AS "последние закрытые сутки",
       max(journal."finished_at") AS "последнее закрытие"
  FROM range_days
  LEFT JOIN xb.fleet_transaction_days AS journal ON journal."park_day" = range_days.park_day;

\echo ''
\echo '== Начаты и не закрыты =='
-- Частичные итоги оборванного обхода. Сутки с курсором следующий запуск продолжит
-- со следующей страницы, без курсора — пройдёт с первой. «429» — за последнюю попытку.
SELECT "park_day" AS "сутки",
       "transactions" AS "транзакций (частично)",
       "pages" AS "страниц",
       "next_cursor" IS NOT NULL AS "продолжится",
       "rate_limited" AS "429",
       "started_at" AS "начат"
  FROM xb.fleet_transaction_days
 WHERE "finished_at" IS NULL
   AND "park_day" BETWEEN :'range_from'::date AND :'range_to'::date
 ORDER BY "park_day";

\echo ''
\echo '== Не начаты: первые 10 =='
SELECT day::date AS "сутки"
  FROM generate_series(:'range_from'::date, :'range_to'::date, interval '1 day') AS day
 WHERE NOT EXISTS (SELECT 1 FROM xb.fleet_transaction_days AS journal WHERE journal."park_day" = day::date)
 ORDER BY day
 LIMIT 10;

\echo ''
\echo '== Последние закрытые =='
SELECT "park_day" AS "сутки",
       "transactions" AS "транзакций",
       "malformed",
       "pages" AS "страниц",
       "rate_limited" AS "429",
       "finished_at" - "started_at" AS "длительность",
       "finished_at" AS "закрыт"
  FROM xb.fleet_transaction_days
 WHERE "finished_at" IS NOT NULL
   AND "park_day" BETWEEN :'range_from'::date AND :'range_to'::date
 ORDER BY "finished_at" DESC
 LIMIT 5;

\echo ''
\echo '== Таблица транзакций целиком =='
SELECT count(*) AS "строк",
       pg_size_pretty(pg_total_relation_size('xb.fleet_transactions')) AS "размер с индексами"
  FROM xb.fleet_transactions;
