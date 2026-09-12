import { PASSWORD_MIN_LENGTH } from '#server/services/employees/config';
import { setPassword } from '#server/services/employees/setPassword';
import { denyAccess } from '#server/utils/denial';
import { requireEmployee } from '#server/utils/employeeAuth';
import { SESSION_COOKIE_NAME } from '#server/utils/employeeSession';
import type { EmployeePasswordResponse } from '#shared/types/employee';

// Сотрудник задаёт себе пароль — только себе, поэтому `me`, а не идентификатор в адресе:
// ручки «поставить пароль другому» не существует, и адреса под неё тоже.
//
// Обычный путь — из Mini App сразу после принятия приглашения: там человек уже доказан
// подписью `initData`, и пароль ему нужен, только чтобы входить в веб.

type PasswordBody = {
  password?: unknown;
};

export default defineEventHandler(async (event): Promise<EmployeePasswordResponse> => {
  const employee = await requireEmployee(event);
  const body = await readBody<PasswordBody>(event);
  const password = typeof body?.password === 'string' ? body.password : '';

  const outcome = await setPassword({ employeeId: employee.employeeId, password });

  if (outcome === 'too_short') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: `пароль должен быть не короче ${PASSWORD_MIN_LENGTH} символов`,
    });
  }

  // Учётки не стало между проверкой доступа и записью — редкость, но отвечать на это
  // пятисоткой нечестно: доступа у этого запроса действительно больше нет.
  //
  // Код тот же, что у проверки доступа на этот же случай: состояние одно, и своя строка
  // здесь — это второй текст про одно состояние, то самое, от чего избавляет словарь.
  if (outcome === 'unknown_employee') {
    throw denyAccess('unknown_employee');
  }

  // Смена пароля гасит все выданные cookie, включая тот, которым сделан этот запрос:
  // оставлять его в браузере значит оставлять значение, которое на следующем же запросе
  // получит 401 без объяснения.
  deleteCookie(event, SESSION_COOKIE_NAME, { path: '/' });

  return { passwordChanged: true };
});
