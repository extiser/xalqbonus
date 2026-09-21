-- Исход окна участника и снимок, из которого замершая неделя рисуется после итога (issue #168).
--
-- Отдельной миграцией, а не правкой миграций каркаса: те уже применены к локальной базе
-- с копией боевой, и приводить её в порядок через `migrate reset` нельзя.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- CreateEnum
CREATE TYPE "campaign_participant_outcome" AS ENUM ('returned', 'short', 'joined_no_trips', 'seen_not_joined', 'no_response');

-- AlterTable
ALTER TABLE "campaign_participants" ADD COLUMN     "day_trips" INTEGER[],
ADD COLUMN     "outcome" "campaign_participant_outcome",
ADD COLUMN     "outcome_at" TIMESTAMPTZ(6),
ADD COLUMN     "qualified_days" INTEGER;

-- Исход и снимок пишутся одним `UPDATE` и живут только вместе: исход без снимка оставил бы
-- замершую неделю без клеток, снимок без исхода — число, которого никто не объявлял.
ALTER TABLE "campaign_participants" ADD CONSTRAINT "campaign_participants_outcome_check"
    CHECK (
        ("outcome" IS NULL AND "outcome_at" IS NULL AND "qualified_days" IS NULL AND "day_trips" IS NULL)
        OR (
            "outcome" IS NOT NULL
            AND "outcome_at" IS NOT NULL
            AND "qualified_days" >= 0
            AND cardinality("day_trips") > 0
            -- Пустой элемент `ALL` пропустил бы молча: сравнение с NULL даёт NULL, и проверка проходит.
            AND array_position("day_trips", NULL) IS NULL
            AND 0 <= ALL ("day_trips")
        )
    );

-- CreateIndex
CREATE INDEX "campaign_participants_campaign_id_half_outcome_idx" ON "campaign_participants"("campaign_id", "half", "outcome");
