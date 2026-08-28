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
-- Отставание отметки от текущего момента — первое, на что смотрят, когда «баллы
-- не начисляются». Прогоны могут идти минута за минутой и все падать: строки в sync_runs
-- при этом появляются, воркер жив, а окно стоит на месте.
SELECT "kind",
       "watermark",
       now() - "watermark" AS "отставание",
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
\echo '== Последние прогоны заказов: разбор =='
-- То, чего у прогона реестра не бывает: как разошлись увиденные заказы и что стало
-- с начислением. У прогонов, прошедших до появления таблицы деталей, здесь пусто —
-- строки задним числом не досочинялись.
SELECT run."kind",
       run."status",
       run."started_at",
       detail."pages"                   AS "страниц",
       detail."orders_inserted"         AS "вставлено",
       detail."orders_updated"          AS "обновлено",
       detail."malformed"               AS "не разобрано",
       detail."skipped_unknown_profile" AS "чужих заказов",
       detail."unknown_profiles"        AS "чужих водителей",
       detail."awarded"                 AS "начислено",
       detail."already_awarded"         AS "уже было",
       detail."not_completed"           AS "не завершено",
       detail."without_ended_at"        AS "без завершения",
       detail."outside_program"         AS "вне программы",
       detail."unknown_trip"            AS "нет поездки"
  FROM xb.sync_runs AS run
  LEFT JOIN xb.sync_run_orders AS detail ON detail."run_id" = run."id"
 WHERE run."kind" IN ('orders', 'orders_catchup')
 ORDER BY run."started_at" DESC
 LIMIT 20;

\echo ''
\echo '== Свод прогонов заказов за сутки и за неделю =='
-- Ради этого свода задача и делалась: «сколько заказов мы потеряли за неделю» отвечается
-- запросом, а не грепом по логам контейнера, переживающим ровно до ротации лога.
WITH periods("период", "с") AS (
    VALUES ('сутки'::text,  now() - interval '1 day'),
           ('неделя'::text, now() - interval '7 days')
)
SELECT period."период",
       count(run."id")                                          AS "прогонов",
       count(run."id") FILTER (WHERE run."status" = 'failed')    AS "упало",
       coalesce(sum(detail."pages"), 0)                          AS "страниц",
       coalesce(sum(detail."orders_inserted"), 0)                AS "вставлено",
       coalesce(sum(detail."orders_updated"), 0)                 AS "обновлено",
       coalesce(sum(detail."malformed"), 0)                      AS "не разобрано",
       coalesce(sum(detail."skipped_unknown_profile"), 0)        AS "чужих заказов",
       coalesce(sum(detail."awarded"), 0)                        AS "начислено",
       coalesce(sum(detail."already_awarded"), 0)                AS "уже было",
       coalesce(sum(detail."not_completed"), 0)                  AS "не завершено",
       coalesce(sum(detail."outside_program"), 0)                AS "вне программы"
  FROM periods AS period
  LEFT JOIN xb.sync_runs AS run
         ON run."kind" IN ('orders', 'orders_catchup')
        AND run."started_at" >= period."с"
  LEFT JOIN xb.sync_run_orders AS detail ON detail."run_id" = run."id"
 GROUP BY period."период", period."с"
 ORDER BY period."с" DESC;

\echo ''
\echo '== Пропущенное: сколько всего и сколько до сих пор =='
-- Разница между колонками и есть ответ на «что потеряно до сих пор», в отличие
-- от «что когда-либо пропускалось».
SELECT "reason"                                            AS "причина",
       count(*)                                            AS "всего",
       count(*) FILTER (WHERE "resolved_at" IS NULL)        AS "не решено",
       coalesce(sum("times_seen") FILTER (WHERE "resolved_at" IS NULL), 0) AS "приносили раз"
  FROM xb.sync_skips
 GROUP BY "reason"
 ORDER BY "reason";

\echo ''
\echo '== Нерешённое пропущенное =='
-- По убыванию числа прогонов, которые его принесли: сверху то, что окно тащит из раза
-- в раз и не может записать. Ссылка — идентификатор заказа либо значение чужого словаря,
-- деталь — недостающее поле, профиль водителя или имя словаря. Адресов, телефонов и имён
-- здесь нет и быть не может.
SELECT "reason"      AS "причина",
       "reference"   AS "ссылка",
       "detail"      AS "деталь",
       "times_seen"  AS "прогонов",
       "first_seen_at",
       "last_seen_at"
  FROM xb.sync_skips
 WHERE "resolved_at" IS NULL
 ORDER BY "times_seen" DESC, "last_seen_at" DESC
 LIMIT 50;

\echo ''
\echo '== Поездки и начисления =='
SELECT (SELECT count(*) FROM xb.trips)                                        AS "поездок",
       (SELECT count(*) FROM xb.trips WHERE "status" = 'complete')            AS "завершённых",
       (SELECT count(*) FROM xb.trips WHERE "ended_at" IS NULL)               AS "без времени завершения",
       (SELECT count(*) FROM xb.trip_events)                                  AS "событий",
       (SELECT count(*) FROM xb.point_transfers WHERE "reason" = 'trip')      AS "начислений за поездки";
