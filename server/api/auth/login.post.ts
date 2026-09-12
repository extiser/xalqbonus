import { readSessionSecret } from '#server/services/employees/config';
import { loginByPassword } from '#server/services/employees/loginByPassword';
import { denyAccess } from '#server/utils/denial';
import { readClientAddress } from '#server/utils/employeeAuth';
import { signEmployeeSession, SESSION_COOKIE_NAME } from '#server/utils/employeeSession';
import type { EmployeeLoginResponse } from '#shared/types/employee';

// Вход сотрудника в веб: телефон и пароль в обмен на подписанный cookie. Решение о том,
// пускать или нет, целиком принимает сервис — здесь разбор тела, cookie и отказ
// (docs/principles.md → «Слои и зависимости»). Текстов отказов здесь нет: исход сервиса
// переводится в код, а текст к коду лежит в словаре (`shared/denials.ts`).
//
// Это единственная ручка приложения, которая работает без проверки доступа: ею доступ
// и получают.

type LoginBody = {
  phone?: unknown;
  password?: unknown;
};

export default defineEventHandler(async (event): Promise<EmployeeLoginResponse> => {
  const body = await readBody<LoginBody>(event);
  const phone = typeof body?.phone === 'string' ? body.phone : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (phone === '' || password === '') {
    // Отказом доступа это не является и кода отказа не несёт: запрос пришёл неполным,
    // и проверяется здесь то, что в нём прислали, а не то, кого пускать.
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'нужны телефон и пароль',
    });
  }

  const result = await loginByPassword({
    phoneRaw: phone,
    password,
    clientAddress: readClientAddress(event),
  });

  if (result.outcome === 'throttled') {
    // 429 с `Retry-After` — ровно то, что этот отказ означает: не «пароль неверен»,
    // а «слишком много попыток, вернитесь позже». Единственный отказ входа, о причине
    // которого человеку говорят прямо, — и единственный, чей текст несёт подстановку:
    // срок у него точный, и называется он минутами.
    setResponseHeader(event, 'Retry-After', result.retryAfterSeconds);

    throw denyAccess('throttled', {
      minutes: String(Math.ceil(result.retryAfterSeconds / 60)),
    });
  }

  if (result.outcome === 'disabled') {
    throw denyAccess('disabled');
  }

  if (result.outcome === 'invalid_credentials') {
    // Единый ответ на «нет такого телефона», «пароля у учётки нет» и «пароль не сошёлся»:
    // различающий ответ превратил бы форму входа в способ узнать, кто заведён в системе.
    // Текст этого отказа о том же молчит — он говорит «данные», а не «пароль».
    throw denyAccess('invalid_credentials');
  }

  setCookie(event, SESSION_COOKIE_NAME, signEmployeeSession(result.session, readSessionSecret()), {
    // Недоступен из JavaScript страницы: cookie сессии не нужен ни одному скрипту,
    // а без флага его забирает первая же найденная XSS.
    httpOnly: true,
    // `lax`, а не `strict`: ссылка на админку из мессенджера при `strict` открывается
    // разлогиненной, хотя сессия жива. Межсайтовых POST-запросов у нас нет.
    sameSite: 'lax',
    // Локально приложение открывается по http, и `secure` сделал бы вход невозможным.
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: result.maxAgeSeconds,
  });

  return { employee: result.employee };
});
