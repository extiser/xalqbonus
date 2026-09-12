import type { H3Event } from 'h3';

import type { EmployeeRole } from '#server/generated/prisma/enums';
import {
  authenticateEmployee,
  type AuthenticatedEmployee,
} from '#server/services/employees/authenticate';
import { SESSION_COOKIE_NAME } from '#server/utils/employeeSession';
import { readInitDataHeader } from '#server/utils/telegramAuth';

/**
 * Вход в проверку доступа со стороны HTTP: достать признаки из запроса, позвать проверку,
 * превратить отказ в ответ.
 *
 * Правил здесь нет ни одного — они живут в `services/employees/authenticate.ts`. Здесь
 * только то, что знает про HTTP: имя cookie и коды ответов. Заголовок с `initData` живёт
 * в `telegramAuth.ts`: он свойство двери Mini App, а в неё ходят обе роли.
 *
 * Проверка зовётся из каждой ручки явно, а не глобальным middleware: ручки без доступа
 * в приложении есть — проба живости, приём апдейтов Telegram, сам вход, — и список
 * исключений в одном месте расходится с действительностью на первой же новой ручке.
 * Явный вызов виден в коде ручки и потеряться не может.
 */

const readSessionCookie = (event: H3Event): string | null =>
  getCookie(event, SESSION_COOKIE_NAME) ?? null;

/**
 * Сотрудник, пришедший этим запросом, или отказ.
 *
 * Отказы разведены по кодам: `401` — «представьтесь заново» (нет признаков, подпись
 * не сошлась, cookie погашен сменой пароля), `403` — «представились, но доступа нет»
 * (учётка выключена или её больше не существует). Разница не косметическая: на первое
 * интерфейс показывает форму входа, на второе — объяснение, потому что вход не поможет.
 */
export const requireEmployee = async (event: H3Event): Promise<AuthenticatedEmployee> => {
  const result = await authenticateEmployee({
    cookieValue: readSessionCookie(event),
    initData: readInitDataHeader(event),
  });

  if (result.outcome === 'authenticated') {
    return result.employee;
  }

  if (result.outcome === 'disabled') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'учётка выключена',
    });
  }

  if (result.outcome === 'unknown_employee') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'этот аккаунт не заведён сотрудником парка',
    });
  }

  throw createError({
    statusCode: 401,
    statusMessage: 'Unauthorized',
    message: 'войдите заново',
  });
};

/**
 * Тот же сотрудник, но ещё и с правом на эту ручку.
 *
 * Роль сверяется со списком разрешённых, а не с рангом «не ниже такой-то»: ранги
 * у нас отвечают на вопрос «кого можно пригласить», и переиспользовать их как лестницу
 * доступа значит объявить, что права ролей вложены друг в друга. Сегодня это так, завтра
 * появится роль, которой открыто своё и закрыто чужое, и лестница начнёт врать молча.
 *
 * Разметка страниц эту же проверку дублирует — ради того, чтобы человек не видел пунктов,
 * которые ему откажут, — но решает она, и только она.
 */
export const requireEmployeeRole = async (
  event: H3Event,
  allowedRoles: readonly EmployeeRole[],
): Promise<AuthenticatedEmployee> => {
  const employee = await requireEmployee(event);

  if (!allowedRoles.includes(employee.role)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'этот раздел вашей роли не открыт',
    });
  }

  return employee;
};

/**
 * Адрес клиента — вторая половина ключа паузы при подборе пароля.
 *
 * Пусто здесь быть не должно, но бывает: запрос без сокета в тесте, разъехавшийся прокси.
 * Пустая строка в этом случае честнее выдуманного адреса — она складывает такие запросы
 * в одну корзину, и перебор через них считается вместе, а не обнуляется на каждом.
 */
export const readClientAddress = (event: H3Event): string =>
  getRequestIP(event, { xForwardedFor: true }) ?? '';
