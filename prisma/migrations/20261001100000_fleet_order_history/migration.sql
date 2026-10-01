-- История заказов парка и журнал сборщика суток (issue #315).
--
-- Две новые таблицы, существующих не трогаем. Внешнего ключа на `park_profiles` нет
-- намеренно: в истории будут заказы профилей, которых нет в нашем реестре.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- CreateTable
CREATE TABLE "fleet_order_history" (
    "order_id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "payment_method" TEXT NOT NULL,
    "work_rule_id" TEXT,
    "booked_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),
    "price" DECIMAL(12,2) NOT NULL,
    "car_callsign" TEXT,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fleet_order_history_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "fleet_order_history_days" (
    "park_day" DATE NOT NULL,
    "orders" INTEGER NOT NULL,
    "complete" INTEGER NOT NULL,
    "malformed" INTEGER NOT NULL,
    "pages" INTEGER NOT NULL,
    "rate_limited" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "fleet_order_history_days_pkey" PRIMARY KEY ("park_day")
);

-- CreateIndex
CREATE INDEX "fleet_order_history_profile_id_ended_at_idx" ON "fleet_order_history"("profile_id", "ended_at");

-- CreateIndex
CREATE INDEX "fleet_order_history_ended_at_idx" ON "fleet_order_history"("ended_at");
