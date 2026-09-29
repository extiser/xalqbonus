-- Заказ у стойки: сотрудник оформляет за водителя, за баллы или за розницу (issue #294,
-- docs/decisions.md → «Заказ оформляет сотрудник у стойки: за баллы или за розницу»).
--
--  * `payment` — чем оплачен заказ, `channel` — откуда он. Все существующие заказы оформлены
--    водителем в боте за баллы: так их и помечаем.
--  * `created_by_employee_id` — кто оформил у стойки, `total_retail` — сумма в сумах.
--  * Код, срок, сумма в баллах и перевод списания становятся необязательными: у заказа стойки
--    нет кода и срока, у розничного — баллов. Что у кого обязано быть, держат проверки ниже.
--  * У позиции появляется розничная цена рядом с ценой в баллах.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- CreateEnum
CREATE TYPE "order_payment" AS ENUM ('points', 'retail');

-- CreateEnum
CREATE TYPE "order_channel" AS ENUM ('bot', 'desk');

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "unit_retail" INTEGER,
ALTER COLUMN "unit_points" DROP NOT NULL;

-- AlterTable. Умолчания — только чтобы пометить существующие заказы, и снимаются сразу:
-- новая вставка обязана назвать способ и канал сама, а не получить их молча.
ALTER TABLE "orders" ADD COLUMN     "channel" "order_channel" NOT NULL DEFAULT 'bot',
ADD COLUMN     "created_by_employee_id" UUID,
ADD COLUMN     "payment" "order_payment" NOT NULL DEFAULT 'points',
ADD COLUMN     "total_retail" INTEGER,
ALTER COLUMN "code" DROP NOT NULL,
ALTER COLUMN "total_points" DROP NOT NULL,
ALTER COLUMN "expires_at" DROP NOT NULL,
ALTER COLUMN "spend_transfer_id" DROP NOT NULL;

ALTER TABLE "orders" ALTER COLUMN "channel" DROP DEFAULT,
ALTER COLUMN "payment" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_employee_id_fkey" FOREIGN KEY ("created_by_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Дальше — то, что Prisma в схеме выразить не умеет: проверки и комментарии. Меняется руками.
-- ---------------------------------------------------------------------------

-- Способ оплаты и поля согласованы. За баллы — сумма в баллах и перевод списания, без суммы
-- в сумах. За розницу — сумма в сумах, без баллов и без переводов вовсе: у розничного заказа
-- нечего ни списывать, ни возвращать. Розница — только у стойки: в боте водитель платит баллами.
--
-- Сумма в баллах у розничного — пусто, а не ноль: ноль читался бы как «заказ за ноль баллов»,
-- а такого заказа не бывает (`orders_total_points_check`).
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_fields_check"
    CHECK (
        CASE "payment"
            WHEN 'points' THEN
                    "total_points" IS NOT NULL
                AND "spend_transfer_id" IS NOT NULL
                AND "total_retail" IS NULL
            WHEN 'retail' THEN
                    "total_retail" IS NOT NULL
                AND "total_points" IS NULL
                AND "spend_transfer_id" IS NULL
                AND "refund_transfer_id" IS NULL
                AND "channel" = 'desk'
        END
    );

-- Сумма в сумах положительна — тем же доводом, что сумма в баллах: продажа за ноль сумов —
-- это не продажа, и в отчёте о проданном за деньги ей делать нечего.
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_retail_check"
    CHECK ("total_retail" > 0);

-- Канал и поля согласованы. Заказ бота несёт код и срок и не называет сотрудника-автора:
-- его оформил водитель. Заказ стойки называет автора, кода и срока не несёт и не висит
-- ни минуты — он выдан той же операцией, что оформлен.
ALTER TABLE "orders" ADD CONSTRAINT "orders_channel_fields_check"
    CHECK (
        CASE "channel"
            WHEN 'bot' THEN
                    "code" IS NOT NULL
                AND "expires_at" IS NOT NULL
                AND "created_by_employee_id" IS NULL
            WHEN 'desk' THEN
                    "created_by_employee_id" IS NOT NULL
                AND "code" IS NULL
                AND "expires_at" IS NULL
                AND "status" <> 'pending'
        END
    );

-- Цена позиции — одна из двух: в баллах или в сумах. Какая, решает способ оплаты заказа,
-- и эту связь строка позиции проверить не может — заказ в другой таблице. Её держит
-- единственный путь вставки, сервисы оформления, и тесты ядра.
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_price_check"
    CHECK (("unit_points" IS NULL) <> ("unit_retail" IS NULL));

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_unit_retail_check"
    CHECK ("unit_retail" > 0);

COMMENT ON TABLE "orders" IS
    'Заказ товара — за баллы или за розницу, водителем в боте или сотрудником у стойки. Баллы списываются при оформлении, выдача переводов не делает, отмена возвращает целиком.';

COMMENT ON TABLE "order_items" IS
    'Позиции заказа. unit_points или unit_retail — цена товара на момент заказа: цена меняется, заказ обязан помнить свою.';

COMMENT ON COLUMN "orders"."code" IS
    'Пять цифр для стойки. Уникален среди pending: выданные и отменённые коды освобождаются. Пуст у заказа стойки.';

COMMENT ON COLUMN "orders"."total_retail" IS
    'Сумма в сумах по розничным ценам. Только у payment = retail: деньги система не принимает, а записывает.';
