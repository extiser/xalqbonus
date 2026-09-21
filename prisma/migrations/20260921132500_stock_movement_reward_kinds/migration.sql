-- Три вида движения остатка под награду (issue #172): резерв при рождении, выдача на стойке
-- и возврат при сгорании.
--
-- Отдельной миграцией от таблицы наград намеренно: новое значение перечисления, добавленное
-- `ALTER TYPE … ADD VALUE`, нельзя использовать в той же транзакции, а проверка знаков
-- движения в следующей миграции называет эти значения по имени.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- AlterEnum
ALTER TYPE "stock_movement_kind" ADD VALUE 'reward_reserve';
ALTER TYPE "stock_movement_kind" ADD VALUE 'reward_issue';
ALTER TYPE "stock_movement_kind" ADD VALUE 'reward_release';
