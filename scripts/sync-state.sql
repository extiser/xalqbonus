-- Что синхронизация думает о себе: отметки и последние прогоны.
--
-- Схема указывается явно — `xb.sync_state`, а не `sync_state`. У сырого соединения
-- `search_path` дефолтный, и запрос без префикса ушёл бы в `public`, где живут таблицы
-- старого бота (docs/decisions.md → «В сыром SQL схема указывается явно»).
--
-- Отчёт, а не проверка: пустой вывод здесь ничего не означает, ненулевого кода возврата
-- не бывает. Проверки инвариантов живут в scripts/invariants.sql.

\pset border 2

\echo '== Отметки синхронизации =='
SELECT "kind",
       "watermark",
       "last_run_id",
       "updated_at"
  FROM xb.sync_state
 ORDER BY "kind";

\echo ''
\echo '== Последние прогоны =='
SELECT "kind",
       "status",
       "started_at",
       "finished_at",
       "window_from",
       "window_to",
       "requests",
       "rate_limited"  AS "отказов",
       "items_seen"    AS "увидено",
       "items_written" AS "записано",
       left(coalesce("error", ''), 60) AS "ошибка"
  FROM xb.sync_runs
 ORDER BY "started_at" DESC
 LIMIT 20;

\echo ''
\echo '== Поездки и начисления =='
SELECT (SELECT count(*) FROM xb.trips)                                        AS "поездок",
       (SELECT count(*) FROM xb.trips WHERE "status" = 'complete')            AS "завершённых",
       (SELECT count(*) FROM xb.trips WHERE "ended_at" IS NULL)               AS "без времени завершения",
       (SELECT count(*) FROM xb.trip_events)                                  AS "событий",
       (SELECT count(*) FROM xb.point_transfers WHERE "reason" = 'trip')      AS "начислений за поездки";
