-- Роль «старший менеджер» между менеджером и админом (issue #291).
--
-- Место в перечислении — перед `manager`: порядок значений повторяет старшинство, как в схеме.
-- Правила доступа на этот порядок не опираются — ранги живут в `server/services/employees/roles.ts`.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

ALTER TYPE "employee_role" ADD VALUE 'senior_manager' BEFORE 'manager';
