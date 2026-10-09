-- Условия ставки новичка по дате найма в `metric_person_months` (issue #450).
--
-- `fee_newcomer_rate`, `payment_newcomer_rate` остаются и дальше считаются по фактическому окну
-- заказа — по условиям его даты найма. Добавляются то же у заказов последних условий
-- (`…_latest`) и оплата в первые 14 и 28 суток с найма — окна цены по условиям месяца экрана.
--
-- Таблица считается целиком заново прогоном денег, и после выката её пересчитывает
-- `make prod-metrics-recompute`. До пересчёта строки заполнены так, чтобы экран не врал: все они
-- посчитаны прежним окном 14 суток, поэтому `payment_hire_days_14` — прежняя оплата в окне,
-- точно. Остальные — нули до пересчёта: на экране их читает только месяц с 28 сутками,
-- а это идущий октябрь 2026, который показывает сентябрь.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- AlterTable
ALTER TABLE "metric_person_months" ADD COLUMN     "fee_newcomer_rate_latest" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "payment_hire_days_14" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "payment_hire_days_28" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "payment_newcomer_rate_latest" DECIMAL(18,4) NOT NULL DEFAULT 0;

UPDATE "metric_person_months" SET "payment_hire_days_14" = "payment_newcomer_rate";

-- Значения пишет только прогон денег: умолчание было нужно лишь для строк, что уже лежат.
ALTER TABLE "metric_person_months" ALTER COLUMN "fee_newcomer_rate_latest" DROP DEFAULT,
ALTER COLUMN "payment_hire_days_14" DROP DEFAULT,
ALTER COLUMN "payment_hire_days_28" DROP DEFAULT,
ALTER COLUMN "payment_newcomer_rate_latest" DROP DEFAULT;
