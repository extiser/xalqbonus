import { consola } from 'consola';

import { findEmployeeByPhone } from '#server/repositories/employees';
import type { AuthenticatedEmployee } from '#server/services/employees/authenticate';
import {
  clearLoginFailures,
  readLoginFailures,
  registerLoginFailure,
} from '#server/repositories/loginAttempts';
import {
  LOGIN_FAILURE_LIMIT,
  LOGIN_FAILURE_WINDOW_SECONDS,
  SESSION_MAX_AGE_SECONDS,
} from '#server/services/employees/config';
import { verifyPassword } from '#server/services/employees/password';
import { normalizePhoneE164 } from '#server/utils/phoneNumber';
import type { EmployeeSession } from '#server/utils/employeeSession';

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
  | {
      outcome: 'signed_in';
      /** То, что уедет в подписанный cookie. */
      session: EmployeeSession;
      /** Кто вошёл — то же, что отдаёт проверка доступа на следующих запросах. */
      employee: AuthenticatedEmployee;
      /** Сколько живёт cookie — ручке, которая его ставит. */
      maxAgeSeconds: number;
    }
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
  const phoneE164 = normalizePhoneE164(request.phoneRaw);

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

  if (employee.disabledAt !== null) {
    // Пароль у выключенной учётки не проверяется вовсе: сверять его значило бы отвечать
    // «пароль верен, но вы выключены» — сведение, которого выключенному знать незачем.
    await registerFailure();

    log.warn('вход в выключенную учётку', { employeeId: employee.id });

    return { outcome: 'disabled' };
  }

  if (!(await verifyPassword(employee.passwordHash, request.password))) {
    await registerFailure();

    log.warn('неверный пароль', { employeeId: employee.id });

    return { outcome: 'invalid_credentials' };
  }

  await clearLoginFailures(phoneE164, request.clientAddress);

  const now = request.now ?? new Date();

  log.info('вход в веб', { employeeId: employee.id, role: employee.role });

  return {
    outcome: 'signed_in',
    session: {
      employeeId: employee.id,
      role: employee.role,
      issuedAtSeconds: Math.floor(now.getTime() / 1000),
    },
    employee: { employeeId: employee.id, role: employee.role, fullName: employee.fullName },
    maxAgeSeconds: SESSION_MAX_AGE_SECONDS,
  };
};
