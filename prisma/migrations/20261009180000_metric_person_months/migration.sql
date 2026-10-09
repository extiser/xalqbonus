-- Готовая таблица плитки «Цена водителя за год» (issue #442).
--
-- `metric_person_months` — заказы, комиссия парка и оплата человека за календарный месяц
-- по Ташкенту из транзакций Fleet, и то же по заказам в окне ставки новичка. Считается целиком
-- заново прогоном денег, в его транзакции; миграция заводит её пустой. Прогон денег пишет
-- в `metric_money_runs.person_month_rows`, сколько строк записал.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- AlterTable
ALTER TABLE "metric_money_runs" ADD COLUMN     "person_month_rows" INTEGER;

-- CreateTable
CREATE TABLE "metric_person_months" (
    "month" DATE NOT NULL,
    "person_id" UUID NOT NULL,
    "orders" INTEGER NOT NULL,
    "fee" DECIMAL(18,4) NOT NULL,
    "payment" DECIMAL(18,4) NOT NULL,
    "fee_newcomer_rate" DECIMAL(18,4) NOT NULL,
    "payment_newcomer_rate" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "metric_person_months_pkey" PRIMARY KEY ("month","person_id")
);

-- CreateIndex
CREATE INDEX "metric_person_months_person_id_idx" ON "metric_person_months"("person_id");

-- AddForeignKey
ALTER TABLE "metric_person_months" ADD CONSTRAINT "metric_person_months_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
