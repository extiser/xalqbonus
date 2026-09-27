import { readTelegramLink } from '#server/services/employees/telegramLink';
import { requireEmployee } from '#server/utils/employeeAuth';
import type { EmployeeTelegramLinkResponse } from '#shared/types/employee';

// Привязка Telegram — блоку на `/password` (issue #267): привязан ли, и живая ссылка, если
// сотрудник её уже выпускал. Только себе, поэтому `me`.
export default defineEventHandler(async (event): Promise<EmployeeTelegramLinkResponse> => {
  const employee = await requireEmployee(event);
  const state = await readTelegramLink(employee.employeeId);

  return {
    bound: state.bound,
    link: state.link === null ? null : { link: state.link.url, expiresAt: state.link.expiresAt.toISOString() },
  };
});
