import { readInviteByToken } from '#server/services/employees/readInviteByToken';
import { readLinkToken } from '#server/utils/employeeLinkFailure';
import type { EmployeeInviteLookupResponse } from '#shared/types/employee';

// Приглашение по токену — странице `/invite/<токен>` (issue #267). Без проверки доступа:
// у открывшего ссылку учётки ещё нет, а токен и есть приглашение.
//
// Мёртвая ссылка — не отказ, а ответ: страница показывает по исходу свою строку, и `200`
// здесь честнее `404` — запрос верный, спрошено про ссылку, и про неё ответили.
export default defineEventHandler(async (event): Promise<EmployeeInviteLookupResponse> => {
  const state = await readInviteByToken(readLinkToken(getRouterParam(event, 'token')));

  if (state.outcome !== 'live') {
    return { outcome: state.outcome };
  }

  return {
    outcome: 'live',
    fullName: state.invite.fullName,
    role: state.invite.role,
    phoneE164: state.invite.phoneE164,
    expiresAt: state.invite.expiresAt.toISOString(),
  };
});
