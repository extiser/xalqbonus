-- Итог заливки копии боевой базы (`make copy-restore`, issue #365): размер и наполнение,
-- по которым видно, что копия легла целиком и какого она дня.
--
-- Схема указывается явно — `xb.trips`, а не `trips` (docs/decisions.md → «В сыром SQL схема
-- указывается явно»). Время — парка: «какого дня копия» читается по ташкентским суткам.

SET timezone = 'Asia/Tashkent';

\pset border 2
\x on

SELECT current_database()                                    AS "база",
       pg_size_pretty(pg_database_size(current_database()))  AS "размер",
       (SELECT count(*) FROM xb.trips)                       AS "xb.trips",
       (SELECT count(*) FROM xb.fleet_order_history)         AS "xb.fleet_order_history",
       (SELECT count(*) FROM xb.point_entries)               AS "xb.point_entries",
       (SELECT count(*) FROM xb.persons)                     AS "xb.persons",
       (SELECT max(ended_at) FROM xb.trips)                  AS "свежая поездка";
