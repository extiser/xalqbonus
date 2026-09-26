-- Демо-сегмент без условий (issue #212): все демо-водители.
--
-- Проверка `segments_has_condition_check` держала «сегмент без условий — весь реестр парка».
-- Для демо-сегмента это не так: построитель состава берёт у него только `persons.is_demo`,
-- и пустые условия означают «все демо-водители» — ими форма и открывается, когда ставят
-- галочку «Демо». Живому сегменту без условий по-прежнему нельзя.
--
-- Prisma проверок не выражает — меняется руками. search_path ставим явно: миграция
-- не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

ALTER TABLE "segments" DROP CONSTRAINT "segments_has_condition_check";

ALTER TABLE "segments" ADD CONSTRAINT "segments_has_condition_check"
    CHECK (
        "days_since_trip_min" IS NOT NULL
        OR "days_since_trip_max" IS NOT NULL
        OR "program_member" IS NOT NULL
        OR "telegram_linked" IS NOT NULL
        OR "balance_min" IS NOT NULL
        OR "balance_max" IS NOT NULL
        OR "is_demo"
    );
