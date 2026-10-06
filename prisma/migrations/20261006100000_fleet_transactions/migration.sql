-- Транзакции парка из Fleet: справочник категорий, транзакции и журнал сборщика суток,
-- плюс два вида прогона — живой сбор и ночное перечитывание (issue #358).
--
-- Новые таблицы, существующих не трогаем. Внешних ключей нет намеренно: категория может
-- прийти раньше, чем её узнает справочник, а транзакции лежат и за профили и заказы,
-- которых у нас нет.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- AlterEnum
ALTER TYPE "sync_kind" ADD VALUE 'transactions';
ALTER TYPE "sync_kind" ADD VALUE 'transactions_recheck';

-- CreateTable
CREATE TABLE "fleet_transaction_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "group_name" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL,
    "is_affecting_driver_balance" BOOLEAN NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fleet_transaction_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fleet_transactions" (
    "id" TEXT NOT NULL,
    "event_at" TIMESTAMPTZ(6) NOT NULL,
    "category_id" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency_code" TEXT,
    "driver_profile_id" TEXT,
    "order_id" TEXT,
    "external_event_id" TEXT,
    "description" TEXT,
    "created_by" TEXT,
    "created_by_dispatcher" TEXT,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fleet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fleet_transaction_days" (
    "park_day" DATE NOT NULL,
    "transactions" INTEGER NOT NULL,
    "malformed" INTEGER NOT NULL,
    "pages" INTEGER NOT NULL,
    "rate_limited" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "finished_at" TIMESTAMPTZ(6),
    "next_cursor" TEXT,

    CONSTRAINT "fleet_transaction_days_pkey" PRIMARY KEY ("park_day")
);

-- CreateIndex
CREATE INDEX "fleet_transactions_order_id_idx" ON "fleet_transactions"("order_id");

-- CreateIndex
CREATE INDEX "fleet_transactions_event_at_idx" ON "fleet_transactions"("event_at");

-- CreateIndex
CREATE INDEX "fleet_transactions_driver_profile_id_event_at_idx" ON "fleet_transactions"("driver_profile_id", "event_at");

-- CreateIndex
CREATE INDEX "fleet_transactions_category_id_event_at_idx" ON "fleet_transactions"("category_id", "event_at");
