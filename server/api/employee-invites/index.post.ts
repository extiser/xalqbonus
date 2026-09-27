import {
  InviteInputError,
  issueInvite,
  RoleNotInvitableError,
} from '#server/services/employees/issueInvite';
import { isEmployeeRole } from '#server/services/employees/roles';
import { readAppOrigin } from '#server/utils/appOrigin';
import { requireEmployee } from '#server/utils/employeeAuth';
import { rejectInviteIssue } from '#server/utils/employeeLinkFailure';
import type { EmployeeInviteResponse } from '#shared/types/employee';

// Выпуск приглашения сотрудника (issue #267): роль, имя и телефон — от приглашающего, ссылка
// ведёт на страницу веба на том же хосте. Она видна в списке живых, пока приглашение живо.
//
// Кого можно приглашать и годятся ли имя с телефоном, решает сервис: это правила, а не разбор
// запроса (docs/principles.md → «Слои и зависимости»).

type InviteBody = {
  role?: unknown;
  fullName?: unknown;
  phone?: unknown;
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
      fullName: typeof body.fullName === 'string' ? body.fullName : '',
      phoneRaw: typeof body.phone === 'string' ? body.phone : '',
      appOrigin: readAppOrigin(event),
    });

    return {
      inviteId: invite.inviteId,
      role: invite.role,
      fullName: invite.fullName,
      phoneE164: invite.phoneE164,
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

    if (error instanceof InviteInputError) {
      throw rejectInviteIssue(error.problem);
    }

    throw error;
  }
});
