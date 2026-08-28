-- Приведение единственного прогона полного обхода к новой семантике счётчиков.
--
-- Предыдущая миграция развела различные профили и строки ответа, но строка живого
-- обхода 28.08.2026 осталась записанной прежним кодом: в `profiles_seen`
-- и `profiles_updated` у неё лежат строки ответов, 29 345, при 25 391 профиле в парке.
-- Пока она такая, свод за сутки и за неделю складывает строки ответа с профилями —
-- ровно тот дефект, ради которого правка и делалась, только переехавший из кода
-- в данные.
--
-- Откуда взято каждое число:
--
--   * `profiles_seen = 25 391` — обход сошёлся с `total` по каждому куску и по реестру
--     целиком; несошедшийся кусок роняет прогон явной ошибкой, поэтому успешный прогон
--     означает ровно это число и никакое другое;
--   * `profiles_inserted = 0` — счётчик вставок и в прежней раскладке считал события
--     вставки, а не строки: ноль означает, что ни одного нового профиля обход не завёл.
--     Берётся из самой строки, а не назначается;
--   * `profiles_updated = 25 391` — все профили, кроме вставленных, то есть все;
--     подтверждается тем, что у 25 391 строки `park_profiles` поле `last_synced_at`
--     равно времени начала обхода;
--   * `response_rows = 29 345` — то, что сейчас лежит в `profiles_seen`: прежний код
--     писал туда именно строки ответов.
--
-- Почему правка точечная и почему из неё не следует общего правила. Это единственный
-- прогон, записанный прежним кодом, и восстановить его значения можно только потому,
-- что обход сверяется с `total` и оставил след в `park_profiles`. У инкрементальных
-- прогонов такого следа нет, и пересчитывать их задним числом нечем — общего правила
-- «пересчитать все старые строки» здесь нет.
--
-- Проверка идёт до записи: если в базе окажется не то, что описано выше, миграция
-- падает, а не записывает числа из чьего-то сообщения. База знает лучше.
--
-- Там, где этого прогона нет — тестовая база, чистая боевая, — миграция не делает
-- ничего и не мешает накатыванию.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

DO $$
DECLARE
    -- Полный обход 28.08.2026, единственный прогон, записанный прежним кодом.
    target_run        constant uuid        := '89797229-acdb-4cf3-9039-0506f4823e6a';
    -- Время начала обхода: им же проставлен `last_synced_at` у всех тронутых профилей.
    crawl_synced_at   constant timestamptz := '2026-08-28 16:43:18.993+00';
    expected_profiles constant integer     := 25391;
    expected_rows     constant integer     := 29345;
    stored_rows    integer;
    stored_inserts integer;
    touched        integer;
BEGIN
    SELECT "profiles_seen", "profiles_inserted"
      INTO stored_rows, stored_inserts
      FROM "sync_run_registry"
     WHERE "run_id" = target_run
       AND "response_rows" = 0;

    IF NOT FOUND THEN
        RAISE NOTICE 'прогона % с прежней раскладкой счётчиков нет — правка не нужна', target_run;
        RETURN;
    END IF;

    IF stored_rows <> expected_rows THEN
        RAISE EXCEPTION 'в строке прогона % лежит % строк ответа вместо ожидаемых % — правка отменена, числа не сходятся с описанными',
            target_run, stored_rows, expected_rows;
    END IF;

    IF stored_inserts <> 0 THEN
        RAISE EXCEPTION 'прогон % записал % вставок вместо нуля — правка отменена: значит, обход всё-таки завёл профили, и «подтверждено = все» неверно',
            target_run, stored_inserts;
    END IF;

    SELECT count(*) INTO touched
      FROM "park_profiles"
     WHERE "last_synced_at" = crawl_synced_at;

    IF touched <> expected_profiles THEN
        RAISE EXCEPTION 'обход тронул % профилей, а не % — правка отменена: число берётся из базы, а не из описания',
            touched, expected_profiles;
    END IF;

    UPDATE "sync_run_registry"
       SET "profiles_seen"     = expected_profiles,
           "profiles_inserted" = 0,
           "profiles_updated"  = expected_profiles,
           "response_rows"     = expected_rows
     WHERE "run_id" = target_run;

    -- Общая таблица прогонов складывается по видам, и мерить их разными единицами
    -- нельзя ровно по той же причине: у этого прогона `items_seen` и `items_written`
    -- тоже держат строки ответа.
    UPDATE "sync_runs"
       SET "items_seen"    = expected_profiles,
           "items_written" = expected_profiles
     WHERE "id" = target_run;

    RAISE NOTICE 'прогон % приведён к новой раскладке: % профилей, % строк ответа',
        target_run, expected_profiles, expected_rows;
END $$;
