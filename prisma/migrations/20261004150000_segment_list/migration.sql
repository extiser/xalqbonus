-- Сегмент-список из итогов опроса; условие сегмента по опросу уходит (issue #356).
--
-- Сегмент — только выборка людей, об опросе он не знает ничего. Результат опроса попадает
-- в сегмент со стороны опроса: кнопка в сводной воронке заводит сегмент-список, люди
-- фиксируются строками `segment_members` в момент нажатия и дальше не пересчитываются.
--
-- Сегментов с условием по опросу на проде нет (единственный демо удалён 04-10-2026), поэтому
-- колонки снимаются без чистки данных.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- CreateEnum
CREATE TYPE "segment_kind" AS ENUM ('conditions', 'list');

-- Условие по опросу — вместе с его проверками.
ALTER TABLE "segments" DROP CONSTRAINT "segments_survey_condition_check";

-- DropForeignKey
ALTER TABLE "segments" DROP CONSTRAINT "segments_survey_id_fkey";

-- `segments_has_condition_check` ссылается на `survey_id` и снимается до колонки.
ALTER TABLE "segments" DROP CONSTRAINT "segments_has_condition_check";

-- AlterTable: существующие строки получают `conditions` значением по умолчанию.
ALTER TABLE "segments" DROP COLUMN "survey_id",
DROP COLUMN "survey_state",
ADD COLUMN     "kind" "segment_kind" NOT NULL DEFAULT 'conditions';

-- DropEnum
DROP TYPE "segment_survey_state";

-- Сегмент без условий — весь реестр парка под видом среза. Исключения два: демо-сегмент
-- (признак сам сужает отбор до демо-водителей) и список (состав — его строки).
ALTER TABLE "segments" ADD CONSTRAINT "segments_has_condition_check"
    CHECK (
        "days_since_trip_min" IS NOT NULL
        OR "days_since_trip_max" IS NOT NULL
        OR "program_member" IS NOT NULL
        OR "telegram_linked" IS NOT NULL
        OR "balance_min" IS NOT NULL
        OR "balance_max" IS NOT NULL
        OR "is_demo"
        OR "kind" = 'list'
    );

-- У списка условий нет: состав зафиксирован, и условие поверх него молча сузило бы список.
ALTER TABLE "segments" ADD CONSTRAINT "segments_list_without_conditions_check"
    CHECK (
        "kind" <> 'list'
        OR (
            "days_since_trip_min" IS NULL
            AND "days_since_trip_max" IS NULL
            AND "program_member" IS NULL
            AND "telegram_linked" IS NULL
            AND "balance_min" IS NULL
            AND "balance_max" IS NULL
        )
    );

-- CreateTable
CREATE TABLE "segment_members" (
    "segment_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "segment_members_pkey" PRIMARY KEY ("segment_id","person_id")
);

-- AddForeignKey
ALTER TABLE "segment_members" ADD CONSTRAINT "segment_members_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segment_members" ADD CONSTRAINT "segment_members_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
