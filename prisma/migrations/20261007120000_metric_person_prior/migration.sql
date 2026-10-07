-- Поездки человека до истории заказов (issue #429): последние сутки с комиссией парка
-- `partner_ride_fee` раньше первых суток метрик. Таблица производная — наполняет её пересчёт
-- метрик (`make metrics-recompute` и ночная задача), миграция заводит её пустой.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- CreateTable
CREATE TABLE "metric_person_prior" (
    "person_id" UUID NOT NULL,
    "last_day" DATE NOT NULL,

    CONSTRAINT "metric_person_prior_pkey" PRIMARY KEY ("person_id")
);

-- AddForeignKey
ALTER TABLE "metric_person_prior" ADD CONSTRAINT "metric_person_prior_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
