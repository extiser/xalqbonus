-- Демо-сущности (issue #212): признак демо у товаров, рассылок, сегментов и акций.
--
-- Правило одно на всё приложение: живое доходит до демо, демо до живого — никогда. Признак —
-- фильтр там, где собирается список, и проверка там, где сущность меняется; отдельных путей
-- «для демо» нет. Ставится при заведении и больше не меняется: ни одна ручка его не правит.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "is_demo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "mailings" ADD COLUMN     "is_demo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "is_demo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "segments" ADD COLUMN     "is_demo" BOOLEAN NOT NULL DEFAULT false;
