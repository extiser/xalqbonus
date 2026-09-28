import { consola } from 'consola';

import { findEmployeeByPhone } from '#server/repositories/employees';
import {
  clearLoginFailures,
  readLoginFailures,
  registerLoginFailure,
} from '#server/repositories/loginAttempts';
import { LOGIN_FAILURE_LIMIT, LOGIN_FAILURE_WINDOW_SECONDS } from '#server/services/employees/config';
import { openSession, type OpenedSession } from '#server/services/employees/openSession';
import { verifyPassword } from '#server/services/employees/password';
import { normalizeLoginPhone } from '#server/utils/phoneNumber';

/**
 * Вход в веб по телефону и паролю.
 *
 * Исходы разведены по причинам только в логе. Наружу все отказы, кроме паузы, выходят
 * одинаково: ответ, различающий «такого телефона нет» и «пароль неверен», превращает форму
 * входа в способ узнать, кто из сотрудников парка заведён в системе.
 *
 * Пауза — исключение, и намеренно: человеку, которому отказали из-за пяти чужих попыток
 * с его адреса, нужно знать, что дело во времени, а не в пароле.
 */

const log = consola.withTag('employees:login');

export type LoginOutcome =
  | 'signed_in'
  /** Телефон не разбирается, учётки нет, пароля у неё нет или он не сошёлся. */
  | 'invalid_credentials'
  /** Учётка выключена. */
  | 'disabled'
  /** Пять неудач подряд на связку «телефон + адрес»: вход по ней временно не принимается. */
  | 'throttled';

export type LoginRequest = {
  phoneRaw: string;
  password: string;
  /** Адрес клиента. Вторая половина ключа паузы. */
  clientAddress: string;
  now?: Date;
};

export type LoginResult =
  | ({ outcome: 'signed_in' } & OpenedSession)
  | {
      outcome: 'throttled';
      retryAfterSeconds: number;
    }
  // Каждый исход отдельным членом объединения, а не `'invalid_credentials' | 'disabled'`
  // одним: объединённый литерал перестаёт быть различителем, и проверка `outcome === ...`
  // у вызывающего кода тип больше не сужает.
  | { outcome: 'invalid_credentials' }
  | { outcome: 'disabled' };

export const loginByPassword = async (request: LoginRequest): Promise<LoginResult> => {
  // Любой номер, а не только узбекский (issue #267): логин сотрудника не обязан быть местным.
  // Узбекский приводится к тому же виду, что прежде, — вход уже заведённых не ломается.
  const phoneE164 = normalizeLoginPhone(request.phoneRaw);

  // Номер, который не приводится к каноническому виду, в базе искать нечем: `phone_e164`
  // хранится только в каноническом виде, и счётчик попыток на такой номер заводить незачем.
  if (!phoneE164) {
    return { outcome: 'invalid_credentials' };
  }

  const throttle = await readLoginFailures(phoneE164, request.clientAddress);

  // Пауза проверяется до сверки пароля: смысл её в том, чтобы перебор перестал получать
  // ответы, а не в том, чтобы получать их чуть медленнее.
  if (throttle.failures >= LOGIN_FAILURE_LIMIT) {
    log.warn('вход отклонён паузой', { address: request.clientAddress });

    return {
      outcome: 'throttled',
      retryAfterSeconds: throttle.ttlSeconds > 0 ? throttle.ttlSeconds : LOGIN_FAILURE_WINDOW_SECONDS,
    };
  }

  const employee = await findEmployeeByPhone(phoneE164);

  // Неудача считается и тогда, когда учётки нет вовсе: перебор по чужим номерам иначе
  // шёл бы без всякой паузы.
  const registerFailure = async (): Promise<void> => {
    await registerLoginFailure(phoneE164, request.clientAddress, LOGIN_FAILURE_WINDOW_SECONDS);
  };

  if (!employee || employee.passwordHash === null) {
    await registerFailure();

    return { outcome: 'invalid_credentials' };
  }

  if (!(await verifyPassword(employee.passwordHash, request.password))) {
    await registerFailure();

    log.warn('неверный пароль', { employeeId: employee.id });

    return { outcome: 'invalid_credentials' };
  }

  // Отказ по выключенной учётке — только после сошедшегося пароля. Проверь мы его раньше,
  // и по одному телефону, не зная пароля, выключенная учётка отличалась бы от всего
  // остального: форма входа отвечала бы, кто из сотрудников парка заведён и уволен.
  //
  // Неудачей это не считается и счётчик не двигает: пароль верен, перебора здесь нет.
  // Не чистится он тоже — вход не состоялся, и прежние неудачи остаются в силе.
  if (employee.disabledAt !== null) {
    log.warn('вход в выключенную учётку', { employeeId: employee.id });

    return { outcome: 'disabled' };
  }

  await clearLoginFailures(phoneE164, request.clientAddress);

  log.info('вход в веб', { employeeId: employee.id, role: employee.role });

  return { outcome: 'signed_in', ...openSession(employee, request.now ?? new Date()) };
};
