import { signOut } from '#server/services/employees/signOut';
import { requireEmployee } from '#server/utils/employeeAuth';
import { SESSION_COOKIE_NAME } from '#server/utils/employeeSession';
import type { EmployeeLogoutResponse } from '#shared/types/employee';

// Выход из веба. Проверка доступа здесь не формальность: погасить сессию можно только
// у того, кто назвался, а назваться тут нечем, кроме той самой сессии.
//
// Делается два действия, и оба обязательны. Сервис гасит сессию в базе — иначе сохранённый
// до выхода cookie продолжал бы пускать тридцать суток. Cookie удаляется из браузера —
// иначе человек, вышедший и не закрывший вкладку, возил бы с собой значение, которое
// на каждом запросе получает 401 без объяснения.
export default defineEventHandler(async (event): Promise<EmployeeLogoutResponse> => {
  const employee = await requireEmployee(event);

  await signOut({ employeeId: employee.employeeId });

  deleteCookie(event, SESSION_COOKIE_NAME, { path: '/' });

  return { signedOut: true };
});
