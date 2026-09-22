-- Открытые сундуки акции и причина начисления `campaign` (issue #181).
--
-- Строка — на открытый сундук, а не на заработанный: заработан ли он, считается от журнала
-- поездок, как зачётный день. Второе открытие держит база — частичными уникальными индексами
-- ниже, а не проверкой в коде (docs/principles.md → «Идемпотентность вместо аккуратности»).
--
-- `point_reason.campaign` описан в docs/points.md и до этой миграции в перечислении отсутствовал.
-- Значение, добавленное `ALTER TYPE … ADD VALUE`, нельзя использовать в той же транзакции, —
-- здесь им не пользуется ничто.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- CreateEnum
CREATE TYPE "campaign_chest_open_source" AS ENUM ('driver', 'timer');

-- AlterEnum
ALTER TYPE "point_reason" ADD VALUE 'campaign';

-- CreateTable
CREATE TABLE "campaign_chests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "campaign_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "kind" "campaign_chest_kind" NOT NULL,
    "day_number" INTEGER,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opened_by" "campaign_chest_open_source" NOT NULL,
    "reward_id" UUID NOT NULL,

    CONSTRAINT "campaign_chests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "campaign_chests_reward_id_key" ON "campaign_chests"("reward_id");

-- AddForeignKey
ALTER TABLE "campaign_chests" ADD CONSTRAINT "campaign_chests_campaign_id_person_id_fkey" FOREIGN KEY ("campaign_id", "person_id") REFERENCES "campaign_participants"("campaign_id", "person_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_chests" ADD CONSTRAINT "campaign_chests_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "rewards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Дальше — то, что Prisma в схеме выразить не умеет: частичные индексы и проверка.
-- Меняется руками.
-- ---------------------------------------------------------------------------

-- Номер дня есть только у сундука дня, и он — день окна, с единицы. У трёхдневного и недельного
-- дня нет: они одни на участие.
ALTER TABLE "campaign_chests" ADD CONSTRAINT "campaign_chests_day_number_check"
    CHECK (
        CASE "kind"
            WHEN 'day' THEN "day_number" IS NOT NULL AND "day_number" >= 1
            ELSE "day_number" IS NULL
        END
    );

-- Сундук дня открывается один раз на день окна участия.
CREATE UNIQUE INDEX "campaign_chests_day_key"
    ON "campaign_chests"("campaign_id", "person_id", "day_number")
    WHERE "kind" = 'day';

-- Сундуки трёх дней и недели открываются один раз на участие.
CREATE UNIQUE INDEX "campaign_chests_step_key"
    ON "campaign_chests"("campaign_id", "person_id", "kind")
    WHERE "kind" <> 'day';

COMMENT ON TABLE "campaign_chests" IS
    'Открытые сундуки акции: строка на открытие со ссылкой на выпавшую награду. Заработанный, но не открытый сундук строкой не хранится.';
