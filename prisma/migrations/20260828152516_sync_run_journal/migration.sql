-- Журнал прогонов синхронизации: детали прогона заказов и пропущенное поимённо.
--
-- Всё, что прогон сегодня считает и говорит одной строкой в лог, начинает оставаться
-- в базе. До этой миграции в `sync_runs` доезжали пять чисел, а на вопрос «сколько заказов
-- мы потеряли за неделю и чьих именно» отвечал только греп по логам контейнера — до первой
-- ротации лога.
--
-- Детали заказов — отдельной таблицей, а не колонками в `sync_runs`: половина прогонов
-- имеет вид `registry`, и разбора начисления у неё не бывает. Общее живёт в прогоне,
-- частное — рядом.
--
-- Уникальность `sync_skips` по паре «причина + ссылка» — не оптимизация, а условие того,
-- что таблица вообще отвечает на вопрос. Перекрытие окон приносит один и тот же
-- пропущенный заказ каждый прогон; без ограничения строки росли бы линейно по времени,
-- и «сколько потеряно» перестало бы иметь ответ.
--
-- Существующие строки `sync_runs` не трогаются и не досочиняются: у прогонов, прошедших
-- до этой миграции, деталей нет и взяться им неоткуда.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- CreateEnum
CREATE TYPE "sync_skip_reason" AS ENUM ('unknown_profile', 'malformed', 'unknown_value');

-- CreateTable
CREATE TABLE "sync_run_orders" (
    "run_id" UUID NOT NULL,
    "pages" INTEGER NOT NULL DEFAULT 0,
    "orders_inserted" INTEGER NOT NULL DEFAULT 0,
    "orders_updated" INTEGER NOT NULL DEFAULT 0,
    "malformed" INTEGER NOT NULL DEFAULT 0,
    "skipped_unknown_profile" INTEGER NOT NULL DEFAULT 0,
    "unknown_profiles" INTEGER NOT NULL DEFAULT 0,
    "awarded" INTEGER NOT NULL DEFAULT 0,
    "already_awarded" INTEGER NOT NULL DEFAULT 0,
    "not_completed" INTEGER NOT NULL DEFAULT 0,
    "without_ended_at" INTEGER NOT NULL DEFAULT 0,
    "outside_program" INTEGER NOT NULL DEFAULT 0,
    "unknown_trip" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sync_run_orders_pkey" PRIMARY KEY ("run_id")
);

-- CreateTable
CREATE TABLE "sync_skips" (
    "id" BIGSERIAL NOT NULL,
    "reason" "sync_skip_reason" NOT NULL,
    "reference" TEXT NOT NULL,
    "detail" TEXT,
    "first_run_id" UUID NOT NULL,
    "last_run_id" UUID NOT NULL,
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "times_seen" INTEGER NOT NULL DEFAULT 1,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "sync_skips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sync_skips_reference_idx" ON "sync_skips"("reference");

-- CreateIndex
CREATE INDEX "sync_skips_resolved_at_times_seen_idx" ON "sync_skips"("resolved_at", "times_seen" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "sync_skips_reason_reference_key" ON "sync_skips"("reason", "reference");

-- AddForeignKey
ALTER TABLE "sync_run_orders" ADD CONSTRAINT "sync_run_orders_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "sync_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_skips" ADD CONSTRAINT "sync_skips_first_run_id_fkey" FOREIGN KEY ("first_run_id") REFERENCES "sync_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_skips" ADD CONSTRAINT "sync_skips_last_run_id_fkey" FOREIGN KEY ("last_run_id") REFERENCES "sync_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
