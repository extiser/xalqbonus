-- Награды водителю (issue #172): своя таблица, три вида движения остатка под неё (завела
-- предыдущая миграция), два признака призового товара, офис и срок наград у акции.
--
-- Награда — не заказ: у заказа обязательны списание баллов и офис, выбранный водителем,
-- позиция ссылается на товар витрины, а срок — это срок резерва. У награды списания нет,
-- офис приходит от акции или сотрудника, товар бывает вне каталога, срок свой.
--
-- Коды заказов и наград разведены первой цифрой: заказы 0–4, награды 5–9. Уникальность внутри
-- таблицы держит частичный индекс, между таблицами — непересечение диапазонов, и оба правила
-- стоят здесь проверками, а не только в генераторе кода.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- CreateEnum
CREATE TYPE "reward_kind" AS ENUM ('points', 'product', 'custom');

-- CreateEnum
CREATE TYPE "reward_status" AS ENUM ('credited', 'awaiting', 'issued', 'expired');

-- CreateEnum
CREATE TYPE "reward_source" AS ENUM ('campaign', 'manual');

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "office_id" UUID,
ADD COLUMN     "reward_lifetime_days" INTEGER;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "hidden_in_catalog" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "promo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "reward_id" UUID;

-- CreateTable
CREATE TABLE "rewards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "person_id" UUID NOT NULL,
    "kind" "reward_kind" NOT NULL,
    "title" TEXT NOT NULL,
    "points" INTEGER,
    "product_id" UUID,
    "office_id" UUID,
    "code" TEXT,
    "status" "reward_status" NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "issued_at" TIMESTAMPTZ(6),
    "issued_by_employee_id" UUID,
    "expired_at" TIMESTAMPTZ(6),
    "source" "reward_source" NOT NULL,
    "campaign_id" UUID,
    "source_note" TEXT,
    "granted_by_employee_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rewards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rewards_person_id_created_at_idx" ON "rewards"("person_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "rewards_office_id_status_idx" ON "rewards"("office_id", "status");

-- CreateIndex
CREATE INDEX "rewards_campaign_id_idx" ON "rewards"("campaign_id");

-- CreateIndex
CREATE INDEX "stock_movements_reward_id_idx" ON "stock_movements"("reward_id");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "rewards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_issued_by_employee_id_fkey" FOREIGN KEY ("issued_by_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_granted_by_employee_id_fkey" FOREIGN KEY ("granted_by_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Дальше — то, что Prisma в схеме выразить не умеет: данные, частичный индекс и проверки.
-- Меняется руками.
-- ---------------------------------------------------------------------------

-- Висящие заказы со старым кодом переводятся в диапазон заказов. Иначе заказ с кодом `5xxxx`
-- мог бы совпасть с кодом награды — ровно тот случай, ради которого диапазоны разводятся.
-- Такие заказы есть только на стендах: на боевой базе схемы `xb` к выкату нет. Новый код
-- подбирается случайным среди свободных: сдвиг первой цифры мог бы наткнуться на занятый.
DO $$
DECLARE
    stale RECORD;
    fresh TEXT;
BEGIN
    FOR stale IN
        SELECT "id" FROM "orders" WHERE "status" = 'pending' AND "code" !~ '^[0-4]'
    LOOP
        LOOP
            fresh := lpad(floor(random() * 50000)::int::text, 5, '0');
            EXIT WHEN NOT EXISTS (
                SELECT 1 FROM "orders" WHERE "status" = 'pending' AND "code" = fresh
            );
        END LOOP;

        UPDATE "orders" SET "code" = fresh, "updated_at" = now() WHERE "id" = stale."id";
    END LOOP;
END
$$;

-- Код висящего заказа — в диапазоне заказов. Выданные и отменённые сохраняют прежний код:
-- он освобождён частичным индексом и у стойки уже не ищется.
ALTER TABLE "orders" ADD CONSTRAINT "orders_code_range_check"
    CHECK ("status" <> 'pending' OR "code" ~ '^[0-4]');

-- Код награды уникален среди ждущих, а не среди всех: выданные и сгоревшие освобождают его —
-- тем же доводом, что у заказа.
CREATE UNIQUE INDEX "rewards_code_awaiting_key" ON "rewards"("code") WHERE "status" = 'awaiting';

-- Пять цифр, первая — из диапазона наград.
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_code_format_check"
    CHECK ("code" IS NULL OR "code" ~ '^[5-9][0-9]{4}$');

-- Пустое пишется одним способом — NULL, а не пробелами. Название есть всегда.
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_texts_check"
    CHECK (
        btrim("title") <> ''
        AND ("source_note" IS NULL OR btrim("source_note") <> '')
    );

-- Вид согласован с полями. Баллы зачисляются сразу: ни кода, ни офиса, ни срока у них нет,
-- и другого статуса, кроме `credited`, не бывает. Товар и произвольная ждут в офисе с кодом
-- и сроком; у товара есть товар, у произвольной — только название.
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_kind_fields_check"
    CHECK (
        CASE "kind"
            WHEN 'points' THEN
                    "points" > 0
                AND "product_id" IS NULL
                AND "office_id" IS NULL
                AND "code" IS NULL
                AND "expires_at" IS NULL
                AND "status" = 'credited'
            WHEN 'product' THEN
                    "points" IS NULL
                AND "product_id" IS NOT NULL
                AND "office_id" IS NOT NULL
                AND "code" IS NOT NULL
                AND "expires_at" IS NOT NULL
                AND "status" <> 'credited'
            WHEN 'custom' THEN
                    "points" IS NULL
                AND "product_id" IS NULL
                AND "office_id" IS NOT NULL
                AND "code" IS NOT NULL
                AND "expires_at" IS NOT NULL
                AND "status" <> 'credited'
        END
    );

-- Статус согласован с отметками — как у заказа: без этого «выдана ли награда» зависело бы
-- от того, какую колонку прочитали.
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_status_fields_check"
    CHECK (
        CASE "status"
            WHEN 'credited' THEN
                    "issued_at" IS NULL AND "issued_by_employee_id" IS NULL AND "expired_at" IS NULL
            WHEN 'awaiting' THEN
                    "issued_at" IS NULL AND "issued_by_employee_id" IS NULL AND "expired_at" IS NULL
            WHEN 'issued' THEN
                    "issued_at" IS NOT NULL AND "issued_by_employee_id" IS NOT NULL AND "expired_at" IS NULL
            WHEN 'expired' THEN
                    "expired_at" IS NOT NULL AND "issued_at" IS NULL AND "issued_by_employee_id" IS NULL
        END
    );

-- Источник согласован с полями. Награда акции называет акцию; ручная — сотрудника, который
-- её вручил, и пояснение: без него через месяц она неотличима от ошибки.
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_source_fields_check"
    CHECK (
        CASE "source"
            WHEN 'campaign' THEN
                    "campaign_id" IS NOT NULL AND "granted_by_employee_id" IS NULL
            WHEN 'manual' THEN
                    "campaign_id" IS NULL
                AND "granted_by_employee_id" IS NOT NULL
                AND "source_note" IS NOT NULL
        END
    );

-- Знаки движения — прежняя проверка, расширенная тремя видами награды. Виды заказа обязаны
-- нести заказ и не несут награды, виды награды — наоборот; приход и правка не несут ни того,
-- ни другого. Без своих видов выдача приза прошла бы мимо журнала остатков, и остаток
-- разъехался бы с полкой.
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_kind_signs_check";

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_kind_signs_check"
    CHECK (
        CASE "kind"
            WHEN 'incoming' THEN
                    "delta_on_hand" > 0
                AND "delta_reserved" = 0
                AND "order_id" IS NULL
                AND "reward_id" IS NULL
            WHEN 'adjustment' THEN
                    "delta_on_hand" <> 0
                AND "delta_reserved" = 0
                AND "order_id" IS NULL
                AND "reward_id" IS NULL
                AND "employee_id" IS NOT NULL
                AND "note" IS NOT NULL
            WHEN 'order_reserve' THEN
                    "delta_on_hand" < 0
                AND "delta_reserved" = -"delta_on_hand"
                AND "order_id" IS NOT NULL
                AND "reward_id" IS NULL
            WHEN 'order_issue' THEN
                    "delta_on_hand" = 0
                AND "delta_reserved" < 0
                AND "order_id" IS NOT NULL
                AND "reward_id" IS NULL
            WHEN 'order_release' THEN
                    "delta_on_hand" > 0
                AND "delta_reserved" = -"delta_on_hand"
                AND "order_id" IS NOT NULL
                AND "reward_id" IS NULL
            WHEN 'reward_reserve' THEN
                    "delta_on_hand" < 0
                AND "delta_reserved" = -"delta_on_hand"
                AND "reward_id" IS NOT NULL
                AND "order_id" IS NULL
            WHEN 'reward_issue' THEN
                    "delta_on_hand" = 0
                AND "delta_reserved" < 0
                AND "reward_id" IS NOT NULL
                AND "order_id" IS NULL
            WHEN 'reward_release' THEN
                    "delta_on_hand" > 0
                AND "delta_reserved" = -"delta_on_hand"
                AND "reward_id" IS NOT NULL
                AND "order_id" IS NULL
        END
    );

-- Опубликованный товар целиком — кроме цены в баллах у приза. Приз не продаётся, и цены
-- в баллах у него не существует: выдуманная уехала бы в закупочные отчёты. Название
-- и обе цены в сумах обязательны у любого опубликованного.
ALTER TABLE "products" DROP CONSTRAINT "products_published_complete_check";

ALTER TABLE "products" ADD CONSTRAINT "products_published_complete_check"
    CHECK (
        "published_at" IS NULL
        OR ("name" IS NOT NULL
            AND ("price_points" IS NOT NULL OR "promo")
            AND "price_retail" IS NOT NULL
            AND "price_cost" IS NOT NULL)
    );

-- Срок жизни наград — целые сутки, не меньше одних.
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_reward_lifetime_days_check"
    CHECK ("reward_lifetime_days" IS NULL OR "reward_lifetime_days" > 0);

-- Запущенная акция называет офис выдачи наград и их срок: награды акции рождаются с ними,
-- и акция без них раздала бы призы, которые негде и неизвестно до какого числа получать.
-- Старых запущенных акций миграция не чинит: на боевой базе схемы `xb` нет, а акции прогона
-- на стендах удаляются перед накаткой.
ALTER TABLE "campaigns" DROP CONSTRAINT "campaigns_status_check";

ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_status_check"
    CHECK (
        ("status" = 'draft' AND "launched_at" IS NULL AND "audience_size" IS NULL)
        OR (
            "status" IN ('running', 'finished')
            AND "launched_at" IS NOT NULL
            AND "audience_size" > 0
            AND "segment_id" IS NOT NULL
            AND "slug" IS NOT NULL
            AND "title" IS NOT NULL
            AND "office_id" IS NOT NULL
            AND "reward_lifetime_days" IS NOT NULL
        )
    );

COMMENT ON TABLE "rewards" IS
    'Награды водителю: баллы, товар или произвольная. Рождаются только сервисом grantReward; товар занимает резерв офиса до выдачи или сгорания.';

COMMENT ON COLUMN "rewards"."code" IS
    'Пять цифр для стойки, первая 5–9: у заказов 0–4. Уникален среди awaiting.';

COMMENT ON COLUMN "rewards"."title" IS
    'Что выдаётся — словами. У товара копия названия на момент рождения: название товара меняется, награда помнит своё.';
