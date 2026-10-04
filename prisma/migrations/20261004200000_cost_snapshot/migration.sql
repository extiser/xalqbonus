-- Снимок себестоимости в строке заказа и в награде-товаре (issue #372).
--
-- Себестоимость фиксируется в момент оформления и дальше живёт своей жизнью от каталога,
-- как уже живут `unit_points` и `unit_retail`: правка цены товара не переписывает прошлые
-- продажи и выдачи (docs/decisions.md → «Себестоимость фиксируется в момент оформления»).
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN "unit_cost" INTEGER;

-- AlterTable
ALTER TABLE "rewards" ADD COLUMN "cost" INTEGER;

-- Себестоимость бывает только у награды-товара: у баллов и произвольной товара нет.
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_cost_check"
    CHECK ("kind" = 'product' OR "cost" IS NULL);

-- Прошлое заполняется текущей ценой каталога: других данных о прошлой цене нет. Пусто
-- остаётся там, где у товара себестоимость не задана.
UPDATE "order_items" AS item
   SET "unit_cost" = product."price_cost"
  FROM "products" AS product
 WHERE product."id" = item."product_id";

UPDATE "rewards" AS reward
   SET "cost" = product."price_cost"
  FROM "products" AS product
 WHERE product."id" = reward."product_id"
   AND reward."kind" = 'product';

COMMENT ON COLUMN "order_items"."unit_cost" IS
    'Себестоимость единицы в сумах на момент заказа, дальше живёт своей жизнью от цены каталога. Пусто — у товара в момент заказа себестоимость не была задана. Строки до снимка заполнены ценой каталога на день, когда снимок заведён.';

COMMENT ON COLUMN "rewards"."cost" IS
    'Себестоимость товара в сумах на момент создания награды, дальше живёт своей жизнью от цены каталога. Только у kind = product. Награды до снимка заполнены ценой каталога на день, когда снимок заведён.';
