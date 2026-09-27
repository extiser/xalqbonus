import type { EmployeeRow } from '#server/repositories/employees';
import { asAuthenticated, type AuthenticatedEmployee } from '#server/services/employees/authenticate';
import { SESSION_MAX_AGE_SECONDS } from '#server/services/employees/config';
import type { EmployeeSession } from '#server/utils/employeeSession';

/**
 * Сессия веба для учётки, которая только что доказала, что она это она: вход по паролю,
 * принятое приглашение, пароль, заданный по ссылке (issue #267).
 *
 * Одним местом, а не тремя: содержимое cookie и срок его жизни — одно правило, и три копии
 * разошлись бы на первой правке.
 */
export type OpenedSession = {
  /** То, что уедет в подписанный cookie. */
  session: EmployeeSession;
  /** Кто вошёл — то же, что отдаёт проверка доступа на следующих запросах. */
  employee: AuthenticatedEmployee;
  /** Сколько живёт cookie — ручке, которая его ставит. */
  maxAgeSeconds: number;
};

export const openSession = (employee: EmployeeRow, now: Date): OpenedSession => ({
  session: {
    employeeId: employee.id,
    role: employee.role,
    // Секундами, округлёнными вниз: с ними сверяется `sessions_valid_from`, и отметка,
    // поставленная тем же действием, cookie не гасит (`authenticate.ts`).
    issuedAtSeconds: Math.floor(now.getTime() / 1000),
  },
  employee: asAuthenticated(employee),
  maxAgeSeconds: SESSION_MAX_AGE_SECONDS,
});
