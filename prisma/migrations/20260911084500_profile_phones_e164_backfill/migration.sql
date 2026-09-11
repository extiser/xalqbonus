-- Пересчёт `phone_e164` по нынешней формуле нормализации.
--
-- До регистрации в боте нормализованный телефон заполнялся только у номера, пришедшего
-- из парка уже в каноническом виде: прогон реестра проверял `phone_raw` регулярным
-- выражением `^\+998\d{9}$` и либо клал номер как есть, либо оставлял `NULL`. Теперь
-- обе стороны — прогон и регистрация — считают его одной функцией
-- (`server/utils/phoneNumber.ts`), и она снимает пробелы, дефисы и скобки и дописывает
-- недостающий плюс.
--
-- Формула изменилась, а уже записанные строки — нет, и сами они не починятся никогда:
-- прогон реестра сравнивает пришедшее с записанным по `phone_raw` (registryWrite.ts,
-- `buildPhoneChanges`), сырой номер у такой строки тот же самый, строка не переоткрывается,
-- и `insertActiveProfilePhones` упирается в `ON CONFLICT (profile_id, phone_raw)
-- WHERE closed_at IS NULL DO NOTHING`.
--
-- Для водителя это замкнутый круг, из которого он не выходит собственными силами:
-- поиск по `phone_e164` его не находит, точечный прогон честно идёт в Fleet API, ничего
-- в реестре не меняет, повторное чтение снова пусто — и он получает «в офис» на каждой
-- попытке, оплачивая её запросом к чужому API.
--
-- Пересчёт идёт по ВСЕМ строкам, включая закрытые: закрытая строка — это номер, по которому
-- мы когда-то писали водителю, и вопрос «по какому именно» должен читаться одинаково
-- на всей таблице, а не только на её открытой части.
--
-- Формула повторена здесь дословно и намеренно, а не вынесена в функцию базы: она живёт
-- в коде, и второе живое определение в базе разошлось бы с ним на первой же правке.
-- Эта миграция — разовое приведение данных к формуле, а не её второй экземпляр.
--
-- Миграция идемпотентна: повторный прогон трогает ноль строк — условие сравнивает
-- записанное с вычисленным.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

DO $$
DECLARE
    open_empty_before integer;
    changed           integer;
    open_empty_after  integer;
BEGIN
    SELECT count(*) INTO open_empty_before
      FROM "profile_phones"
     WHERE "closed_at" IS NULL AND "phone_e164" IS NULL;

    WITH computed AS (
        SELECT cleaned."id",
               -- Канонический вид или NULL: угадывать за парк нельзя — номер, к которому
               -- дописали чужой код страны, найдёт в реестре постороннего человека.
               CASE
                   WHEN cleaned."candidate" ~ '^\+998[0-9]{9}$' THEN cleaned."candidate"
               END AS "e164"
          FROM (
              SELECT "id",
                     CASE
                         WHEN "stripped" LIKE '+%' THEN "stripped"
                         ELSE '+' || "stripped"
                     END AS "candidate"
                FROM (
                    SELECT "id", regexp_replace("phone_raw", '[\s()-]', '', 'g') AS "stripped"
                      FROM "profile_phones"
                ) AS raw
          ) AS cleaned
    )
    UPDATE "profile_phones" AS phone
       SET "phone_e164" = computed."e164"
      FROM computed
     WHERE computed."id" = phone."id"
       AND phone."phone_e164" IS DISTINCT FROM computed."e164";

    GET DIAGNOSTICS changed = ROW_COUNT;

    SELECT count(*) INTO open_empty_after
      FROM "profile_phones"
     WHERE "closed_at" IS NULL AND "phone_e164" IS NULL;

    RAISE NOTICE 'нормализованный телефон пересчитан: тронуто % строк, открытых без номера было %, стало %',
        changed, open_empty_before, open_empty_after;
END $$;
