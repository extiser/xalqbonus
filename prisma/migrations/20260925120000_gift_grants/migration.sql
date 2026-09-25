-- Подарки от Xalq Taxi (issue #219): раздача баллов одному водителю или сегменту, награда
-- «ждёт, заберите» и отметки зачисления.
--
-- Подарок — это награда-баллы, которая рождается `claimable`: на балансе её нет, пока водитель
-- не заберёт её сам или не наступит дата раздачи. Журнал пишется в момент зачисления, а не
-- раздачи, — поэтому у ждущего подарка есть срок (`expires_at`), а у зачисленного — момент
-- и способ зачисления.
--
-- Значения `reward_status.claimable` и `reward_source.gift` добавляются здесь же, а значение,
-- добавленное `ALTER TYPE … ADD VALUE`, нельзя использовать в той же транзакции. Поэтому
-- проверки ниже сравнивают статус и источник текстом (`"status"::text`): текст не разбирается
-- в значение перечисления, и одной миграции хватает.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- CreateEnum
CREATE TYPE "gift_claim_mode" AS ENUM ('driver', 'auto');

-- AlterEnum
ALTER TYPE "reward_source" ADD VALUE 'gift';

-- AlterEnum
ALTER TYPE "reward_status" ADD VALUE 'claimable';

-- AlterTable
ALTER TABLE "rewards" ADD COLUMN     "claim_mode" "gift_claim_mode",
ADD COLUMN     "claimed_at" TIMESTAMPTZ(6),
ADD COLUMN     "gift_grant_id" UUID,
ADD COLUMN     "gift_shown_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "gift_grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "until_date" DATE NOT NULL,
    "segment_id" UUID,
    "person_id" UUID,
    "recipients" INTEGER NOT NULL,
    "skipped" INTEGER NOT NULL,
    "granted_by_employee_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gift_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gift_grants_created_at_idx" ON "gift_grants"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "rewards_gift_grant_id_person_id_key" ON "rewards"("gift_grant_id", "person_id");

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_gift_grant_id_fkey" FOREIGN KEY ("gift_grant_id") REFERENCES "gift_grants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_grants" ADD CONSTRAINT "gift_grants_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "segments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_grants" ADD CONSTRAINT "gift_grants_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_grants" ADD CONSTRAINT "gift_grants_granted_by_employee_id_fkey" FOREIGN KEY ("granted_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Дальше — то, что Prisma в схеме выразить не умеет: проверки. Меняется руками.
-- ---------------------------------------------------------------------------

-- Раздача: баллы положительны, повод написан, получатель ровно один — водитель или сегмент.
-- Раздача одному водителю — это одна награда и никого пропущенного.
ALTER TABLE "gift_grants" ADD CONSTRAINT "gift_grants_fields_check"
    CHECK (
            "points" > 0
        AND btrim("reason") <> ''
        AND ("segment_id" IS NULL) <> ("person_id" IS NULL)
        AND "recipients" > 0
        AND "skipped" >= 0
        AND ("person_id" IS NULL OR ("recipients" = 1 AND "skipped" = 0))
    );

-- Вид согласован с полями. У баллов теперь два пути: обычные зачисляются сразу и срока
-- не имеют, подарок ждёт со сроком автозачисления и после зачисления его помнит. Товар
-- и произвольная подарком не бывают и `claimable` не знают.
ALTER TABLE "rewards" DROP CONSTRAINT "rewards_kind_fields_check";

ALTER TABLE "rewards" ADD CONSTRAINT "rewards_kind_fields_check"
    CHECK (
        CASE "kind"
            WHEN 'points' THEN
                    "points" > 0
                AND "product_id" IS NULL
                AND "office_id" IS NULL
                AND "code" IS NULL
                AND (
                        (    "gift_grant_id" IS NULL
                         AND "expires_at" IS NULL
                         AND "status"::text = 'credited')
                     OR (    "gift_grant_id" IS NOT NULL
                         AND "expires_at" IS NOT NULL
                         AND "status"::text IN ('claimable', 'credited'))
                    )
            WHEN 'product' THEN
                    "points" IS NULL
                AND "product_id" IS NOT NULL
                AND "office_id" IS NOT NULL
                AND "code" IS NOT NULL
                AND "expires_at" IS NOT NULL
                AND "gift_grant_id" IS NULL
                AND "status"::text IN ('awaiting', 'issued', 'expired')
            WHEN 'custom' THEN
                    "points" IS NULL
                AND "product_id" IS NULL
                AND "office_id" IS NOT NULL
                AND "code" IS NOT NULL
                AND "expires_at" IS NOT NULL
                AND "gift_grant_id" IS NULL
                AND "status"::text IN ('awaiting', 'issued', 'expired')
        END
    );

-- Ждёт «заберите» только подарок-баллы. Следует из проверки вида, но записано отдельно:
-- это правило подарка, и искать его будут по этому имени.
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_claimable_check"
    CHECK ("status"::text <> 'claimable' OR ("kind" = 'points' AND "gift_grant_id" IS NOT NULL));

-- Статус согласован с отметками. Зачисленный подарок помнит момент и способ зачисления —
-- оба сразу; у ждущего и у всех прочих наград их нет.
ALTER TABLE "rewards" DROP CONSTRAINT "rewards_status_fields_check";

ALTER TABLE "rewards" ADD CONSTRAINT "rewards_status_fields_check"
    CHECK (
        CASE "status"::text
            WHEN 'credited' THEN
                    "issued_at" IS NULL AND "issued_by_employee_id" IS NULL AND "expired_at" IS NULL
                AND ("claimed_at" IS NULL) = ("gift_grant_id" IS NULL)
                AND ("claim_mode" IS NULL) = ("gift_grant_id" IS NULL)
            WHEN 'claimable' THEN
                    "issued_at" IS NULL AND "issued_by_employee_id" IS NULL AND "expired_at" IS NULL
                AND "claimed_at" IS NULL AND "claim_mode" IS NULL
            WHEN 'awaiting' THEN
                    "issued_at" IS NULL AND "issued_by_employee_id" IS NULL AND "expired_at" IS NULL
                AND "claimed_at" IS NULL AND "claim_mode" IS NULL
            WHEN 'issued' THEN
                    "issued_at" IS NOT NULL AND "issued_by_employee_id" IS NOT NULL AND "expired_at" IS NULL
                AND "claimed_at" IS NULL AND "claim_mode" IS NULL
            WHEN 'expired' THEN
                    "expired_at" IS NOT NULL AND "issued_at" IS NULL AND "issued_by_employee_id" IS NULL
                AND "claimed_at" IS NULL AND "claim_mode" IS NULL
        END
    );

-- Источник согласован с полями. Подарок называет свою раздачу, сотрудника, который её
-- сделал, и повод — копией из раздачи, как название товара у награды: стойка и карточка
-- водителя читают его из награды как есть.
ALTER TABLE "rewards" DROP CONSTRAINT "rewards_source_fields_check";

ALTER TABLE "rewards" ADD CONSTRAINT "rewards_source_fields_check"
    CHECK (
        CASE "source"::text
            WHEN 'campaign' THEN
                    "campaign_id" IS NOT NULL
                AND "granted_by_employee_id" IS NULL
                AND "gift_grant_id" IS NULL
            WHEN 'manual' THEN
                    "campaign_id" IS NULL
                AND "granted_by_employee_id" IS NOT NULL
                AND "source_note" IS NOT NULL
                AND "gift_grant_id" IS NULL
            WHEN 'gift' THEN
                    "gift_grant_id" IS NOT NULL
                AND "campaign_id" IS NULL
                AND "granted_by_employee_id" IS NOT NULL
                AND "source_note" IS NOT NULL
        END
    );

-- Отметка «шторку видел» есть только у подарка.
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_gift_shown_check"
    CHECK ("gift_shown_at" IS NULL OR "gift_grant_id" IS NOT NULL);
