-- Кто из сотрудников закрыл привязку Telegram (issue #305).
--
-- Перепривязка и отвязка из карточки водителя закрывают строку `telegram_links` от имени
-- сотрудника: вопрос «кто и когда снял этот аккаунт с Telegram» обязан иметь ответ через год
-- (docs/drivers.md → «Перепривязка — операция, а не побочный эффект»).
--
-- Старые строки не заполняются: кто закрывал их, неизвестно — склейка, отказ Telegram
-- и SQL на проде 29-09-2026 имени не оставили.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- AlterTable
ALTER TABLE "telegram_links" ADD COLUMN     "closed_by_employee_id" UUID;

-- AddForeignKey
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_closed_by_employee_id_fkey" FOREIGN KEY ("closed_by_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
