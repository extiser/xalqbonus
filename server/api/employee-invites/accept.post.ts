import { acceptInvite } from '#server/services/employees/acceptInvite';
import { readLinkToken, rejectInviteAccept } from '#server/utils/employeeLinkFailure';
import { issueSessionCookie } from '#server/utils/sessionCookie';
import type { EmployeeLoginResponse } from '#shared/types/employee';

// Принятие приглашения в вебе (issue #267): токен и пароль в обмен на учётку и cookie сессии —
// как после входа по паролю. Без проверки доступа: учётки до этого запроса нет.
//
// Решает сервис; здесь — разбор тела, отказ по коду и cookie.

type AcceptBody = {
  token?: unknown;
  password?: unknown;
};

export default defineEventHandler(async (event): Promise<EmployeeLoginResponse> => {
  const body = await readBody<AcceptBody>(event);

  const result = await acceptInvite({
    token: readLinkToken(body?.token),
    password: typeof body?.password === 'string' ? body.password : '',
  });

  if (result.outcome !== 'signed_in') {
    throw rejectInviteAccept(result.outcome);
  }

  return { employee: issueSessionCookie(event, result) };
});
