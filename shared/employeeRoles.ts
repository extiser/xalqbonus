// Словарь берётся у Prisma: это наше перечисление, оно меняется нашей же миграцией.
// Импорт только типа — в сборку не попадает ни байта.
import type { EmployeeRole } from '../server/generated/prisma/enums';

/**
 * Подписи ролей сотрудника — одни на экран и на сервер: экраны учёток подписывают ими роль,
 * отчёт «Работа сотрудников» (issue #310) — колонку `Роль`. Лежат здесь тем же доводом,
 * что `POINT_REASON_LABELS` (`shared/pointReasons.ts`).
 */
export const EMPLOYEE_ROLE_LABELS: Record<EmployeeRole, string> = {
  owner: 'владелец',
  admin: 'админ',
  senior_manager: 'старший менеджер',
  manager: 'менеджер',
};
