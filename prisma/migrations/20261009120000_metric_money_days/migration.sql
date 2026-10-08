-- Готовая таблица вкладки «Деньги» и журнал её пересчёта (issue #438).
--
-- `metric_money_days` — заказы, доход и оплата парка за сутки по Ташкенту из транзакций Fleet.
-- Строка на каждые сутки от первых суток денег, в том числе с нулями. Считается целиком
-- заново после ночного перечитывания транзакций; миграция заводит её пустой.
-- `metric_money_runs` — строка на прогон пересчёта: по ней экран говорит, когда и по какие
-- сутки посчитано.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- CreateTable
CREATE TABLE "metric_money_days" (
    "day" DATE NOT NULL,
    "orders" INTEGER NOT NULL,
    "income" DECIMAL(18,4) NOT NULL,
    "payment" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "metric_money_days_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "metric_money_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "days_from" DATE NOT NULL,
    "days_to" DATE NOT NULL,
    "rows" INTEGER,
    "error" TEXT,

    CONSTRAINT "metric_money_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "metric_money_runs_finished_at_idx" ON "metric_money_runs"("finished_at");
