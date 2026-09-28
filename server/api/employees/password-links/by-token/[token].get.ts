import { readPasswordLink } from '#server/services/employees/readPasswordLink';
import { readLinkToken } from '#server/utils/employeeLinkFailure';
import type { EmployeePasswordLinkLookupResponse } from '#shared/types/employee';

// Ссылка «задать пароль» по токену — странице `/set-password/<токен>` (issue #267). Без
// проверки доступа: пароль сброшен, и войти человеку нечем. Мёртвая ссылка — ответ `200`
// с исходом, как у приглашения (`employee-invites/by-token`).
export default defineEventHandler(async (event): Promise<EmployeePasswordLinkLookupResponse> => {
  const state = await readPasswordLink(readLinkToken(getRouterParam(event, 'token')));

  if (state.outcome !== 'live') {
    return { outcome: state.outcome };
  }

  return {
    outcome: 'live',
    fullName: state.fullName,
    phoneE164: state.phoneE164,
    expiresAt: state.expiresAt.toISOString(),
  };
});
