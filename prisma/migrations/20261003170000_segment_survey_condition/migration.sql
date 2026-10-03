-- Условие сегмента по опросу (issue #324).
--
-- `survey_id` — опрос условия, `survey_state` — кто из получивших его входит в сегмент:
-- `not_completed` — не прошёл и не отказался, `declined` — отказался и не прошёл. Условие
-- по опросу у сегмента одно и склеивается с остальными через «и». Что опрос заморожен и того же
-- мира, что сегмент, проверяет сервис: `CHECK` соседнюю таблицу не видит.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- CreateEnum
CREATE TYPE "segment_survey_state" AS ENUM ('not_completed', 'declined');

-- AlterTable
ALTER TABLE "segments" ADD COLUMN     "survey_id" UUID,
ADD COLUMN     "survey_state" "segment_survey_state";

-- AddForeignKey
ALTER TABLE "segments" ADD CONSTRAINT "segments_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "surveys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Опрос без состояния не говорит, кого брать, а состояние без опроса — по какому опросу:
-- заполнены обе колонки или ни одной.
ALTER TABLE "segments" ADD CONSTRAINT "segments_survey_condition_check"
    CHECK (("survey_id" IS NULL) = ("survey_state" IS NULL));

-- Условие по опросу само ограничивает состав — считается условием наравне с остальными.
ALTER TABLE "segments" DROP CONSTRAINT "segments_has_condition_check";

ALTER TABLE "segments" ADD CONSTRAINT "segments_has_condition_check"
    CHECK (
        "days_since_trip_min" IS NOT NULL
        OR "days_since_trip_max" IS NOT NULL
        OR "program_member" IS NOT NULL
        OR "telegram_linked" IS NOT NULL
        OR "balance_min" IS NOT NULL
        OR "balance_max" IS NOT NULL
        OR "survey_id" IS NOT NULL
        OR "is_demo"
    );
