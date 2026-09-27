import type { H3Event } from 'h3';

import { readSessionSecret } from '#server/services/employees/config';
import type { OpenedSession } from '#server/services/employees/openSession';
import { signEmployeeSession, SESSION_COOKIE_NAME } from '#server/utils/employeeSession';
import type { EmployeeIdentity } from '#shared/types/employee';

/**
 * Cookie сессии веба — одним местом на три ручки, которые его выдают: вход по паролю,
 * принятие приглашения и пароль, заданный по ссылке (issue #267). Флаги cookie — правило
 * одно, и три его копии разошлись бы на первой правке.
 *
 * Отдаёт то, чем ручки отвечают: кто вошёл, поимённо, как в `/api/auth/me`, — признак демо
 * (issue #205) дело проверки доступа, а не ответа, и наружу он не уходит.
 */
export const issueSessionCookie = (event: H3Event, opened: OpenedSession): EmployeeIdentity => {
  setCookie(event, SESSION_COOKIE_NAME, signEmployeeSession(opened.session, readSessionSecret()), {
    // Недоступен из JavaScript страницы: cookie сессии не нужен ни одному скрипту,
    // а без флага его забирает первая же найденная XSS.
    httpOnly: true,
    // `lax`, а не `strict`: ссылка на админку из мессенджера при `strict` открывается
    // разлогиненной, хотя сессия жива. Межсайтовых POST-запросов у нас нет.
    sameSite: 'lax',
    // Локально приложение открывается по http, и `secure` сделал бы вход невозможным.
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: opened.maxAgeSeconds,
  });

  return {
    employeeId: opened.employee.employeeId,
    role: opened.employee.role,
    fullName: opened.employee.fullName,
    phoneE164: opened.employee.phoneE164,
  };
};
