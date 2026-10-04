-- Готовая таблица метрик дашборда и журнал её пересчёта (issue #371).
--
-- `metric_person_days` — поездки человека за сутки по Ташкенту, из объединения `trips`
-- и `fleet_order_history`. Считается ночью целиком заново, строк без поездок нет.
-- `metric_recompute_runs` — строка на прогон пересчёта: по ней экран говорит, когда посчитано.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- CreateTable
CREATE TABLE "metric_person_days" (
    "day" DATE NOT NULL,
    "person_id" UUID NOT NULL,
    "trips" INTEGER NOT NULL,

    CONSTRAINT "metric_person_days_pkey" PRIMARY KEY ("day","person_id"),
    -- Строк без поездок нет: человек, не ездивший в сутки, в них отсутствует.
    CONSTRAINT "metric_person_days_trips_check" CHECK ("trips" > 0)
);

-- CreateTable
CREATE TABLE "metric_recompute_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "days_from" DATE NOT NULL,
    "days_to" DATE NOT NULL,
    "rows" INTEGER,
    "unattributed_orders" INTEGER,
    "error" TEXT,

    CONSTRAINT "metric_recompute_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "metric_person_days_person_id_day_idx" ON "metric_person_days"("person_id", "day");

-- CreateIndex
CREATE INDEX "metric_recompute_runs_finished_at_idx" ON "metric_recompute_runs"("finished_at");

-- AddForeignKey
ALTER TABLE "metric_person_days" ADD CONSTRAINT "metric_person_days_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
