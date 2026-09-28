-- Столкновения привязок Telegram перед переносом старой базы.
--
-- Шаг участия переноса открывает активную привязку каждой сопоставленной записи
-- `public."Drivers"` с годным `chat_id`. Повтор он отсекает только по паре «человек + чат»,
-- а одна активная привязка на чат и одна на человека держатся уникальными индексами
-- `telegram_links_active_chat_key` и `telegram_links_active_person_key`. Живая привязка
-- в `xb`, стоящая поперёк, роняет перенос посередине, и повтор падает там же
-- (разбор в PR #275). Запрос перечисляет такие привязки до запуска — решает по каждой человек.
--
-- Два вида столкновений:
--   чат занят         — чат записи держит активная привязка другого человека: демо-зритель,
--                       проверочная учётка, водитель, прошедший регистрацию в Mini App;
--   у человека другой — профиль записи уже в `xb`, и его человек держит активную привязку
--   чат                 на другой чат: зарегистрировался в Mini App с другого Telegram.
--
-- Человек, с которым перенос сопоставит запись, известен заранее, только если её профиль
-- уже лежит в `xb.park_profiles`. Остальных перенос заведёт по выгрузке реестра — для них
-- любая активная привязка на этот чат считается столкновением, колонка `профиль в xb` это
-- показывает. Половины двойных пар в вывод не попадают: перенос заводит их привязки
-- закрытыми, индексы они не задевают. Пары, которые склеятся только номером ВУ, запросу
-- без выгрузки реестра не видны — такие строки лишние, но не пропущенные.
--
-- Только чтение, и это свойство сеанса: первой строкой он переводится в read only.
-- Непустой результат — ненулевой код возврата, как у scripts/invariants.sql.
--
-- Запуск: docker/DEPLOY-MANUAL.md → «Перенос старой базы в день выката», шаг 6;
-- на репетиции его зовёт scripts/rehearse-legacy-import.sh.

\set ON_ERROR_STOP on
SET default_transaction_read_only = on;
\pset border 2

\warn '=== Столкновения привязок Telegram с записями старой базы ==='
WITH legacy AS (
    -- Записи, которым перенос откроет привязку: годный `chat_id` — тот же шаблон, что
    -- `USABLE_CHAT_ID_PATTERN` в server/utils/legacyChatId.ts.
    SELECT driver.id                          AS legacy_driver_id,
           driver.chat_id::text::bigint        AS chat_id,
           driver.profile_id,
           profile.person_id                   AS mapped_person_id
      FROM public."Drivers" AS driver
      LEFT JOIN xb.park_profiles AS profile ON profile.profile_id = driver.profile_id
     WHERE driver.chat_id::text ~ '^\d{6,10}$'
),
single AS (
    -- Без половин двойных пар: пара по общему `profile_id` или по человеку в `xb`.
    SELECT legacy.*
      FROM legacy
     WHERE NOT EXISTS (
               SELECT 1 FROM legacy AS other
                WHERE other.legacy_driver_id <> legacy.legacy_driver_id
                  AND (other.profile_id = legacy.profile_id
                       OR other.mapped_person_id = legacy.mapped_person_id)
           )
),
collision AS (
    SELECT 'чат занят'                AS kind,
           single.legacy_driver_id,
           single.chat_id             AS legacy_chat_id,
           single.mapped_person_id,
           link.id                    AS link_id,
           link.person_id             AS link_person_id,
           link.telegram_chat_id      AS link_chat_id
      FROM single
      JOIN xb.telegram_links AS link
        ON link.closed_at IS NULL
       AND (link.telegram_chat_id = single.chat_id OR link.telegram_user_id = single.chat_id)
       AND link.person_id IS DISTINCT FROM single.mapped_person_id
    UNION ALL
    SELECT 'у человека другой чат',
           single.legacy_driver_id,
           single.chat_id,
           single.mapped_person_id,
           link.id,
           link.person_id,
           link.telegram_chat_id
      FROM single
      JOIN xb.telegram_links AS link
        ON link.closed_at IS NULL
       AND link.person_id = single.mapped_person_id
       AND link.telegram_chat_id <> single.chat_id
)
SELECT collision.kind                              AS "столкновение",
       collision.legacy_driver_id                  AS "Drivers.id",
       collision.legacy_chat_id                    AS "чат записи",
       collision.link_chat_id                      AS "чат привязки",
       collision.link_id                           AS "привязка",
       collision.link_person_id                    AS "person_id привязки",
       person.is_demo                              AS "is_demo",
       EXISTS (
           SELECT 1 FROM xb.demo_viewers AS viewer
            WHERE viewer.person_id = collision.link_person_id
               OR viewer.telegram_user_id = collision.link_chat_id
       )                                           AS "в demo_viewers",
       collision.mapped_person_id IS NOT NULL      AS "профиль в xb"
  FROM collision
  JOIN xb.persons AS person ON person.id = collision.link_person_id
 ORDER BY collision.kind, collision.legacy_driver_id;
SELECT :ROW_COUNT > 0 AS has_collisions \gset

\if :has_collisions
DO $$ BEGIN
    RAISE EXCEPTION 'столкновения привязок — перенос не запускать, каждую строку выше решает человек';
END $$;
\else
\warn 'Столкновений привязок нет: перенос откроет привязки старой базы, не задев живые.'
\endif
