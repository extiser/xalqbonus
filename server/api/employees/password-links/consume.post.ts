import { consumePasswordLink } from '#server/services/employees/consumePasswordLink';
import { denyAccess } from '#server/utils/denial';
import { readLinkToken, rejectPasswordLink } from '#server/utils/employeeLinkFailure';
import { issueSessionCookie } from '#server/utils/sessionCookie';
import type { EmployeeLoginResponse } from '#shared/types/employee';

// Пароль по ссылке после сброса (issue #267): токен и пароль в обмен на cookie сессии — как
// после входа по паролю. Без проверки доступа: пароль сброшен, и войти человеку нечем.

type ConsumeBody = {
  token?: unknown;
  password?: unknown;
};

export default defineEventHandler(async (event): Promise<EmployeeLoginResponse> => {
  const body = await readBody<ConsumeBody>(event);

  const result = await consumePasswordLink({
    token: readLinkToken(body?.token),
    password: typeof body?.password === 'string' ? body.password : '',
  });

  // Выключенная учётка — отказ двери, тот же, что на входе: пароль ей не задан, и сделать
  // человеку с этим нечего, кроме как обратиться к руководителю.
  if (result.outcome === 'disabled') {
    throw denyAccess('disabled');
  }

  if (result.outcome !== 'changed') {
    throw rejectPasswordLink(result.outcome);
  }

  return { employee: issueSessionCookie(event, result) };
});
