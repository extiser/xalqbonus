-- Призы сундуков акции (issue #180): строка на вариант приза, ступень — своим перечислением.
--
-- Вид приза — существующий `reward_kind`: второе перечисление с теми же значениями разошлось бы
-- с первым на первой же правке. Поля значения те же, что у награды, — строка приза становится
-- наградой без домысливания.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- CreateEnum
CREATE TYPE "campaign_chest_kind" AS ENUM ('day', 'three_days', 'week');

-- CreateTable
CREATE TABLE "campaign_prizes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "campaign_id" UUID NOT NULL,
    "chest" "campaign_chest_kind" NOT NULL,
    "kind" "reward_kind" NOT NULL,
    "weight" INTEGER NOT NULL,
    "points" INTEGER,
    "product_id" UUID,
    "title" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_prizes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaign_prizes_campaign_id_chest_idx" ON "campaign_prizes"("campaign_id", "chest");

-- CreateIndex
CREATE INDEX "campaign_prizes_product_id_idx" ON "campaign_prizes"("product_id");

-- AddForeignKey
ALTER TABLE "campaign_prizes" ADD CONSTRAINT "campaign_prizes_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_prizes" ADD CONSTRAINT "campaign_prizes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Дальше — то, что Prisma в схеме выразить не умеет: частичный индекс и проверки.
-- Меняется руками.
-- ---------------------------------------------------------------------------

-- Вид согласован с полями: у баллов — сумма, у товара — товар, у произвольной — название,
-- остальное пусто. Тем же способом, что `rewards_kind_fields_check`.
ALTER TABLE "campaign_prizes" ADD CONSTRAINT "campaign_prizes_kind_fields_check"
    CHECK (
        CASE "kind"
            WHEN 'points' THEN
                    "points" > 0
                AND "product_id" IS NULL
                AND "title" IS NULL
            WHEN 'product' THEN
                    "product_id" IS NOT NULL
                AND "points" IS NULL
                AND "title" IS NULL
            WHEN 'custom' THEN
                    "title" IS NOT NULL
                AND btrim("title") <> ''
                AND "points" IS NULL
                AND "product_id" IS NULL
        END
    );

-- Вес строго больше нуля: вариант с нулевым весом не выпадет никогда, и место ему не в таблице,
-- а в удалении.
ALTER TABLE "campaign_prizes" ADD CONSTRAINT "campaign_prizes_weight_check"
    CHECK ("weight" > 0);

-- Сундуки трёх дней и недели фиксированные: вариант один на акцию. Второй означал бы розыгрыш
-- там, где его нет.
CREATE UNIQUE INDEX "campaign_prizes_fixed_chest_key"
    ON "campaign_prizes"("campaign_id", "chest")
    WHERE "chest" IN ('three_days', 'week');

COMMENT ON TABLE "campaign_prizes" IS
    'Наполнение сундуков акции: вариант приза с весом. Правится только у черновика и только набором целиком.';
