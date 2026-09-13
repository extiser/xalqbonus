-- Каталог, офисы и ядро заказа за баллы: офисы, товары, остатки по офисам с журналом
-- движения, заказ с позициями и тремя операциями над ним.
--
-- Решения записаны в docs/decisions.md → «Каталог: заказ — это касса, остаток живёт
-- по офисам». Коротко то, что видно в этой миграции:
--
--  * Баллы списываются при оформлении, а не при выдаче. Поэтому `spend_transfer_id`
--    у заказа обязателен, а `refund_transfer_id` появляется вместе со статусом
--    `cancelled`: выдача переводов не делает вовсе.
--  * Остаток живёт только по офисам. Центрального склада нет: в старой базе остаток
--    лежал в двух местах, и центральный склад после раздачи всегда был нулём.
--  * `office_stock` — кэш, истина — `stock_movements`. Ровно то же отношение, что
--    у `accounts.balance` и `point_entries`, и равенство проверяется запросами
--    из scripts/invariants.sql.
--  * Позиция помнит цену: `order_items.unit_points` — цена на момент заказа.
--
-- История заказов старой базы не переносится: каталог очищен парком 28-08-2026
-- и заполняется заново из веба, а 214 заказов до мая 2025 вообще не имеют позиций.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- CreateEnum
CREATE TYPE "stock_movement_kind" AS ENUM ('incoming', 'adjustment', 'order_reserve', 'order_issue', 'order_release');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('pending', 'issued', 'cancelled');

-- CreateEnum
CREATE TYPE "order_cancel_reason" AS ENUM ('driver', 'employee', 'expired');

-- AlterTable
ALTER TABLE "point_transfers" ADD COLUMN     "order_id" UUID;

-- CreateTable
CREATE TABLE "offices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "map_url" TEXT,
    "work_hours" TEXT,
    "phone_e164" TEXT,
    "telegram" TEXT,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_offices" (
    "employee_id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_offices_pkey" PRIMARY KEY ("employee_id","office_id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "photo_path" TEXT,
    "price_points" INTEGER NOT NULL,
    "price_retail" INTEGER NOT NULL,
    "price_cost" INTEGER NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "office_stock" (
    "office_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "on_hand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "office_stock_pkey" PRIMARY KEY ("office_id","product_id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" BIGINT GENERATED ALWAYS AS IDENTITY,
    "office_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "kind" "stock_movement_kind" NOT NULL,
    "delta_on_hand" INTEGER NOT NULL DEFAULT 0,
    "delta_reserved" INTEGER NOT NULL DEFAULT 0,
    "order_id" UUID,
    "employee_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "number" INTEGER GENERATED ALWAYS AS IDENTITY,
    "person_id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "status" "order_status" NOT NULL,
    "code" TEXT NOT NULL,
    "total_points" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "issued_at" TIMESTAMPTZ(6),
    "issued_by_employee_id" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" "order_cancel_reason",
    "cancelled_by_employee_id" UUID,
    "spend_transfer_id" UUID NOT NULL,
    "refund_transfer_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" BIGINT GENERATED ALWAYS AS IDENTITY,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_points" INTEGER NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_offices_office_id_idx" ON "employee_offices"("office_id");

-- CreateIndex
CREATE INDEX "office_stock_product_id_idx" ON "office_stock"("product_id");

-- CreateIndex
CREATE INDEX "stock_movements_office_id_product_id_id_idx" ON "stock_movements"("office_id", "product_id", "id");

-- CreateIndex
CREATE INDEX "stock_movements_order_id_idx" ON "stock_movements"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_number_key" ON "orders"("number");

-- CreateIndex
CREATE UNIQUE INDEX "orders_spend_transfer_id_key" ON "orders"("spend_transfer_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_refund_transfer_id_key" ON "orders"("refund_transfer_id");

-- CreateIndex
CREATE INDEX "orders_person_id_created_at_idx" ON "orders"("person_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_office_id_status_idx" ON "orders"("office_id", "status");

-- CreateIndex
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_order_id_product_id_key" ON "order_items"("order_id", "product_id");

-- AddForeignKey
--
-- Отложенный намеренно, и это единственный отложенный ключ в схеме. Ссылки кольцевые:
-- заказ обязан помнить перевод списания (`orders.spend_transfer_id` NOT NULL), перевод —
-- свой заказ, а ключ идемпотентности списания строится от `orders.id`. Внутри одной
-- транзакции оформления сначала пишется перевод, потом заказ, и немедленная проверка
-- отбила бы ссылку на строку, которая появится двумя запросами позже.
ALTER TABLE "point_transfers" ADD CONSTRAINT "point_transfers_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "employee_offices" ADD CONSTRAINT "employee_offices_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_offices" ADD CONSTRAINT "employee_offices_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_stock" ADD CONSTRAINT "office_stock_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_stock" ADD CONSTRAINT "office_stock_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_issued_by_employee_id_fkey" FOREIGN KEY ("issued_by_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancelled_by_employee_id_fkey" FOREIGN KEY ("cancelled_by_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_spend_transfer_id_fkey" FOREIGN KEY ("spend_transfer_id") REFERENCES "point_transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_refund_transfer_id_fkey" FOREIGN KEY ("refund_transfer_id") REFERENCES "point_transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Дальше — то, что Prisma в схеме выразить не умеет: частичный индекс, проверки
-- и комментарии. Меняется руками.
-- ---------------------------------------------------------------------------

-- Код заказа уникален среди висящих, а не среди всех: выданные и отменённые коды
-- освобождаются, и пяти цифр хватает при десятке висящих заказов на весь парк.
-- Уникальность среди всей истории потребовала бы больше цифр и быстро исчерпала бы их
-- ради заказов, которые уже закрыты.
CREATE UNIQUE INDEX "orders_code_pending_key" ON "orders"("code") WHERE "status" = 'pending';

-- Код — ровно пять цифр. Проверка тут, а не только в коде: генератор кода один,
-- но заказ в базу кладёт SQL, а не типы, и «пять цифр» здесь единственное место,
-- где это написано исполняемо.
ALTER TABLE "orders" ADD CONSTRAINT "orders_code_format_check"
    CHECK ("code" ~ '^[0-9]{5}$');

-- Суммы заказа положительны. Следствие цены товара в баллах, которая строго положительна,
-- и количества, которое тоже: бесплатных позиций в каталоге не бывает, а заказ на ноль
-- баллов — это операция, которой нечего списывать.
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_points_check"
    CHECK ("total_points" > 0);

-- Статус и поля согласованы. Без этой проверки «выдан ли заказ» начинает зависеть
-- от того, какую колонку прочитали: статус, время выдачи или сотрудника.
--
-- Висящий не несёт ни следов выдачи, ни следов отмены. Выданный называет время и человека.
-- Отменённый называет время, причину и перевод возврата — баллы за отменённый заказ
-- обязаны быть возвращены, и ссылка на перевод это подтверждает.
ALTER TABLE "orders" ADD CONSTRAINT "orders_status_fields_check"
    CHECK (
        CASE "status"
            WHEN 'pending' THEN
                    "issued_at" IS NULL
                AND "issued_by_employee_id" IS NULL
                AND "cancelled_at" IS NULL
                AND "cancel_reason" IS NULL
                AND "cancelled_by_employee_id" IS NULL
                AND "refund_transfer_id" IS NULL
            WHEN 'issued' THEN
                    "issued_at" IS NOT NULL
                AND "issued_by_employee_id" IS NOT NULL
                AND "cancelled_at" IS NULL
                AND "cancel_reason" IS NULL
                AND "cancelled_by_employee_id" IS NULL
                AND "refund_transfer_id" IS NULL
            WHEN 'cancelled' THEN
                    "cancelled_at" IS NOT NULL
                AND "cancel_reason" IS NOT NULL
                AND "refund_transfer_id" IS NOT NULL
                AND "issued_at" IS NULL
                AND "issued_by_employee_id" IS NULL
        END
    );

-- Автор отмены есть ровно у отмены сотрудником. У `driver` и `expired` человека
-- не было: первую сделал водитель в Mini App, вторую — воркер просрочки, и записать
-- им в авторы сотрудника значило бы соврать в разборе спора у стойки.
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancel_author_check"
    CHECK (
        "cancel_reason" IS NULL
        OR (("cancel_reason" = 'employee') = ("cancelled_by_employee_id" IS NOT NULL))
    );

-- Позиция заказа: количество положительное, цена на момент заказа — тоже.
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_check"
    CHECK ("quantity" > 0);

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_unit_points_check"
    CHECK ("unit_points" > 0);

-- Цена в баллах строго положительна, сумовые цены неотрицательны. Товар за ноль баллов —
-- это не подарок, а позиция витрины, которую можно заказать бесконечно.
ALTER TABLE "products" ADD CONSTRAINT "products_price_points_check"
    CHECK ("price_points" > 0);

ALTER TABLE "products" ADD CONSTRAINT "products_price_retail_check"
    CHECK ("price_retail" >= 0);

ALTER TABLE "products" ADD CONSTRAINT "products_price_cost_check"
    CHECK ("price_cost" >= 0);

-- Остаток не уходит в минус ни свободной частью, ни резервом. Минус здесь — это ошибка
-- кода, и база обязана её остановить, а не записать: выданный дважды товар из базы
-- не вычитается. Тот же смысл, что у `accounts_driver_balance_check` у баллов.
ALTER TABLE "office_stock" ADD CONSTRAINT "office_stock_on_hand_check"
    CHECK ("on_hand" >= 0);

ALTER TABLE "office_stock" ADD CONSTRAINT "office_stock_reserved_check"
    CHECK ("reserved" >= 0);

-- Знаки движения жёстко связаны с его видом, и неверная запись не проходит вовсе.
--
-- `incoming` — приход в офис: плюс к свободному остатку, резерв не трогается, заказа нет.
-- `adjustment` — правка руками в любую сторону, но не нулевая, с автором и заметкой:
-- правка без объяснения через месяц неотличима от ошибки кода.
-- `order_reserve` — товар ушёл из свободного остатка в резерв, суммарно ноль.
-- `order_issue` — резерв снят, товар ушёл из офиса: свободный остаток не меняется.
-- `order_release` — резерв вернулся в свободный остаток, суммарно ноль.
--
-- Три вида заказа обязаны нести заказ, приход и правка — не имеют права: движение,
-- у которого «почему» не сходится с «по какому заказу», ломает третий запрос остатков
-- в scripts/invariants.sql и не даёт собрать историю заказа.
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_kind_signs_check"
    CHECK (
        CASE "kind"
            WHEN 'incoming' THEN
                    "delta_on_hand" > 0
                AND "delta_reserved" = 0
                AND "order_id" IS NULL
            WHEN 'adjustment' THEN
                    "delta_on_hand" <> 0
                AND "delta_reserved" = 0
                AND "order_id" IS NULL
                AND "employee_id" IS NOT NULL
                AND "note" IS NOT NULL
            WHEN 'order_reserve' THEN
                    "delta_on_hand" < 0
                AND "delta_reserved" = -"delta_on_hand"
                AND "order_id" IS NOT NULL
            WHEN 'order_issue' THEN
                    "delta_on_hand" = 0
                AND "delta_reserved" < 0
                AND "order_id" IS NOT NULL
            WHEN 'order_release' THEN
                    "delta_on_hand" > 0
                AND "delta_reserved" = -"delta_on_hand"
                AND "order_id" IS NOT NULL
        END
    );

COMMENT ON TABLE "offices" IS
    'Офисы парка. Не удаляются: на них ссылаются заказы. Закрытый помечается archived_at.';

COMMENT ON TABLE "employee_offices" IS
    'За какими офисами закреплён сотрудник. Многие-ко-многим, своего id у строки нет.';

COMMENT ON TABLE "products" IS
    'Товары каталога. Не удаляются, а архивируются: на них ссылаются позиции заказов.';

COMMENT ON TABLE "office_stock" IS
    'Остаток товара в офисе. Кэш журнала stock_movements, а не значение: правится только вместе с движением, в одной транзакции.';

COMMENT ON TABLE "stock_movements" IS
    'Журнал движения остатков: каждая строка отвечает на вопрос «почему остаток такой». Истина по остатку — здесь.';

COMMENT ON TABLE "orders" IS
    'Заказ товара за баллы. Баллы списываются при оформлении, выдача переводов не делает, отмена возвращает целиком.';

COMMENT ON TABLE "order_items" IS
    'Позиции заказа. unit_points — цена товара на момент заказа: цена меняется, заказ обязан помнить свою.';

COMMENT ON COLUMN "orders"."number" IS
    'Сквозной номер для людей. Ключи идемпотентности строятся от id, а не от него.';

COMMENT ON COLUMN "orders"."code" IS
    'Пять цифр для стойки. Уникален среди pending: выданные и отменённые коды освобождаются.';

COMMENT ON COLUMN "point_transfers"."order_id" IS
    'Заказ товара за баллы — не заказ такси из Fleet API. Ключ отложенный: ссылки кольцевые.';
