import {
  BotUnavailableError,
  issueInvite,
  RoleNotInvitableError,
} from '#server/services/employees/issueInvite';
import { isEmployeeRole } from '#server/services/employees/roles';
import { requireEmployee } from '#server/utils/employeeAuth';
import type { EmployeeInviteResponse } from '#shared/types/employee';

// Выпуск приглашения сотрудника. Ссылка возвращается один раз и больше не восстанавливается
// ниоткуда: в базе лежит только хеш токена.
//
// Кого можно приглашать, решает сервис: «роль строго ниже своей» — это правило, а не разбор
// запроса (docs/principles.md → «Слои и зависимости»).

type InviteBody = {
  role?: unknown;
};

export default defineEventHandler(async (event): Promise<EmployeeInviteResponse> => {
  const employee = await requireEmployee(event);
  const body = await readBody<InviteBody>(event);

  if (!isEmployeeRole(body?.role)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'роль приглашения должна быть owner, admin или manager',
    });
  }

  try {
    const invite = await issueInvite({
      actor: { employeeId: employee.employeeId, role: employee.role },
      role: body.role,
    });

    return {
      inviteId: invite.inviteId,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
      link: invite.link,
    };
  } catch (error) {
    if (error instanceof RoleNotInvitableError) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Forbidden',
        message: 'приглашать можно только роль ниже своей',
      });
    }

    // Бота нет — вести ссылке некуда. Это состояние машины, а не ошибка сотрудника,
    // поэтому 503, а не 400: выпуск заработает, как только появится токен.
    if (error instanceof BotUnavailableError) {
      throw createError({
        statusCode: 503,
        statusMessage: 'Service Unavailable',
        message: 'бот не настроен: ссылку приглашения выписывать не на кого',
      });
    }

    throw error;
  }
});
