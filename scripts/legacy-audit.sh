#!/usr/bin/env bash
# Инвентаризация старой схемы public по issue #6.
#
# Запросы, которыми собран _reference/legacy/public-schema-2026-08-27.md.
# Только SELECT: сеанс поднимается в режиме default_transaction_read_only,
# любая попытка записи отобьётся базой, а не аккуратностью автора.
#
# Запуск:  ./scripts/legacy-audit.sh
# Файл лежит в scripts/, а не в *.sql, потому что *.sql в .gitignore.

set -euo pipefail

DATABASE_URL="${DATABASE_URL:-postgresql://xalqbonus:xalqbonus@localhost:5434/xalqbonus}"
export PGOPTIONS="-c default_transaction_read_only=on"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --pset pager=off <<'SQL'

\echo '=== 1. Инвентаризация таблиц ==='
SELECT c.relname AS "таблица",
       (SELECT n_live_tup FROM pg_stat_user_tables s WHERE s.relid = c.oid) AS "строк",
       pg_size_pretty(pg_total_relation_size(c.oid)) AS "размер"
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY pg_total_relation_size(c.oid) DESC;

\echo '=== 2. Drivers: DDL ==='
\d "Drivers"

\echo '=== 3. Drivers: заполненность колонок ==='
SELECT count(*) AS "всего",
       count(*) FILTER (WHERE profile_id ~ '^[0-9a-f]{32}$')                    AS "profile_id 32hex",
       count(DISTINCT profile_id)                                              AS "profile_id уник",
       count(*) FILTER (WHERE license_number IS NULL)                          AS "ВУ NULL",
       count(DISTINCT license_number)                                          AS "ВУ уник",
       count(*) FILTER (WHERE chat_id IS NULL)                                 AS "chat_id NULL",
       count(DISTINCT chat_id)                                                 AS "chat_id уник",
       count(*) FILTER (WHERE chat_id ~ '[^0-9]')                              AS "chat_id грязных",
       count(*) FILTER (WHERE callsign IS NULL OR btrim(callsign) = '')        AS "позывной пуст",
       count(*) FILTER (WHERE car_number IS NULL OR car_number = 'not_found')  AS "авто пусто",
       count(*) FILTER (WHERE middle_name IS NULL)                             AS "отчество NULL",
       count(*) FILTER (WHERE working_status IS NULL)                          AS "статус NULL",
       count(*) FILTER (WHERE points IS NULL)                                  AS "баллы NULL",
       count(DISTINCT referral_code)                                           AS "реф.код уник"
FROM "Drivers";

\echo '=== 4. Drivers: распределения ==='
SELECT language AS "язык", count(*) FROM "Drivers" GROUP BY 1 ORDER BY 2 DESC;
SELECT coalesce(working_status, '∅ NULL') AS "статус работы", count(*) FROM "Drivers" GROUP BY 1 ORDER BY 2 DESC;
SELECT to_char("createdAt", 'YYYY-MM') AS "месяц регистрации", count(*) FROM "Drivers" GROUP BY 1 ORDER BY 1;
SELECT count(*) FILTER (WHERE points < 0) AS "отрицательных",
       min(points), max(points), sum(points::bigint) AS "сумма",
       percentile_disc(0.5) WITHIN GROUP (ORDER BY points) AS "медиана"
FROM "Drivers";
SELECT min(days_without_trips), max(days_without_trips),
       round(avg(days_without_trips)) AS "среднее"
FROM "Drivers";

\echo '=== 5. Drivers: когорты по дате заведения ==='
WITH trips AS (SELECT driver_id, count(*) n FROM "Trips" GROUP BY 1),
     orders AS (SELECT driver_id, count(*) n FROM "Orders" GROUP BY 1)
SELECT CASE WHEN d."createdAt" < '2024-12-19' THEN 'массовый импорт 18.12.2024'
            ELSE 'зарегистрировались позже' END AS "когорта",
       count(*) AS "записей",
       count(*) FILTER (WHERE d.is_bonus = 'yes')          AS "получили бонус",
       count(*) FILTER (WHERE trips.driver_id IS NOT NULL) AS "есть поездки",
       count(*) FILTER (WHERE orders.driver_id IS NOT NULL) AS "есть заказы за баллы",
       count(*) FILTER (WHERE trips.driver_id IS NULL AND coalesce(d.points, 0) > 0) AS "баллы без поездок"
FROM "Drivers" d
LEFT JOIN trips ON trips.driver_id = d.id
LEFT JOIN orders ON orders.driver_id = d.id
GROUP BY 1;

\echo '=== 6. Drivers: записи с общим profile_id (двойники) ==='
WITH shared AS (SELECT profile_id FROM "Drivers" GROUP BY 1 HAVING count(*) > 1)
SELECT dense_rank() OVER (ORDER BY d.profile_id) AS "пара", d.id,
       left(d.phone, 5) || '***' || right(d.phone, 2) AS "телефон",
       CASE WHEN d.license_number IS NULL THEN 'NULL'
            ELSE left(d.license_number, 2) || '***' || right(d.license_number, 2) END AS "ВУ",
       d.points, d.language, to_char(d."createdAt", 'YYYY-MM-DD') AS "заведён",
       (SELECT count(*) FROM "Trips" t WHERE t.driver_id = d.id) AS "поездок"
FROM "Drivers" d JOIN shared ON shared.profile_id = d.profile_id
ORDER BY d.profile_id, d.id;

\echo '=== 7. Trips: DDL ==='
\d "Trips"

\echo '=== 8. Trips: статусы и время завершения ==='
SELECT status, count(*) AS "строк",
       round(100.0 * count(*) / sum(count(*)) OVER (), 2) AS "доля,%",
       count(*) FILTER (WHERE ended_at IS NULL) AS "ended_at пуст",
       count(*) FILTER (WHERE price IS NULL) AS "цена пуста"
FROM "Trips" GROUP BY status ORDER BY 2 DESC;

\echo '=== 9. Trips: уникальность идентификатора заказа ==='
SELECT count(*) AS "строк", count(DISTINCT trip_id) AS "уник trip_id",
       count(*) - count(DISTINCT trip_id) AS "лишних строк",
       count(DISTINCT driver_id) AS "водителей с поездками"
FROM "Trips";
WITH repeated AS (
  SELECT trip_id, count(*) n, count(DISTINCT driver_id) drivers
  FROM "Trips" GROUP BY 1 HAVING count(*) > 1)
SELECT count(*) AS "trip_id с повторами", sum(n) AS "строк в них",
       count(*) FILTER (WHERE drivers > 1) AS "у разных водителей", max(n) AS "макс копий"
FROM repeated;
WITH doubled AS (
  SELECT trip_id, driver_id, count(*) n
  FROM "Trips" WHERE status = 'complete' GROUP BY 1, 2 HAVING count(*) > 1)
SELECT count(*) AS "групп дублей complete",
       sum(n) - count(*) AS "лишних завершённых поездок"
FROM doubled;

\echo '=== 10. Trips: помесячно ==='
SELECT to_char(booked_at, 'YYYY-MM') AS "месяц", count(*) AS "поездок",
       count(*) FILTER (WHERE ended_at IS NULL) AS "зависших"
FROM "Trips" GROUP BY 1 ORDER BY 1;

\echo '=== 11. Заказы товаров за баллы ==='
\d "Orders"
SELECT status, count(*), count(DISTINCT driver_id) AS "водителей",
       count(*) FILTER (WHERE manager_id IS NULL) AS "без менеджера",
       count(*) FILTER (WHERE voted) AS "с оценкой"
FROM "Orders" GROUP BY 1 ORDER BY 2 DESC;
SELECT count(*) AS "позиций", count(DISTINCT order_id) AS "заказов с позициями",
       (SELECT count(*) FROM "Orders" o
        WHERE NOT EXISTS (SELECT 1 FROM "OrderItems" i WHERE i.order_id = o.id)) AS "заказов без позиций"
FROM "OrderItems";

\echo '=== 12. Остальные таблицы ==='
SELECT r.name AS "роль", count(u.id) AS "пользователей"
FROM "Roles" r LEFT JOIN "Users" u ON u.role_id = r.id GROUP BY 1 ORDER BY 2 DESC;
SELECT count(*) AS "офисов" FROM "Offices";
SELECT status, count(*), min(price_points), max(price_points) FROM "Products" GROUP BY 1;
SELECT count(*) AS "активаций купонов", count(DISTINCT driver_id) AS "водителей" FROM "ActivatedCoupons";
SELECT count(*) AS "оценок менеджеров", round(avg(rate), 2) AS "средняя" FROM "ManagerRatings";
SELECT count(*) AS "строк журнала DriverPoints" FROM "DriverPoints";

SQL
