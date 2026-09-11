import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearLoginFailures } from '#server/repositories/loginAttempts';
import { authenticateEmployee } from '#server/services/employees/authenticate';
import {
  LOGIN_FAILURE_LIMIT,
  PASSWORD_MIN_LENGTH,
  SESSION_MAX_AGE_SECONDS,
} from '#server/services/employees/config';
import { loginByPassword } from '#server/services/employees/loginByPassword';
import { hashPassword, verifyPassword } from '#server/services/employees/password';
import { setPassword } from '#server/services/employees/setPassword';
import { signEmployeeSession } from '#server/utils/employeeSession';
import { disconnectDatabase } from '../support/database';
import {
  cleanupTestEmployees,
  createTestEmployee,
  nextTestPhone,
  readTestEmployee,
} from '../support/employees';
import { disconnectQueues } from '../support/queues';

/**
 * Вход сотрудника и проверка доступа: пароль, выключенная учётка, погашенные сменой пароля
 * cookie, пауза при подборе.
 *
 * Секрет подписи берётся тот же, что у приложения: тест проверяет ровно тот путь, которым
 * ходит рабочий код, а не свою копию подписи.
 */

const PASSWORD = 'довольно-длинный-пароль';
const CLIENT_ADDRESS = '203.0.113.7';

const SESSION_SECRET = process.env.EMPLOYEE_SESSION_SECRET ?? '';

const sessionCookieFor = (employeeId: string, issuedAt: Date): string =>
  signEmployeeSession(
    { employeeId, role: 'admin', issuedAtSeconds: Math.floor(issuedAt.getTime() / 1000) },
    SESSION_SECRET,
  );

describe('доступ сотрудника', () => {
  beforeEach(() => {
    // Без секрета проверять нечего: подпись cookie на такой машине не выдаётся вовсе.
    expect(SESSION_SECRET).not.toBe('');
  });

  afterEach(cleanupTestEmployees);
  afterAll(async () => {
    await disconnectDatabase();
    await disconnectQueues();
  });

  it('пароль сверяется хешем, а короткий не принимается вовсе', async () => {
    const hash = await hashPassword(PASSWORD);

    expect(hash).not.toContain(PASSWORD);
    expect(await verifyPassword(hash, PASSWORD)).toBe(true);
    expect(await verifyPassword(hash, `${PASSWORD}!`)).toBe(false);
    // Испорченный хеш — отказ, а не исключение: одна кривая строка в базе не должна
    // превращать форму входа в ошибку сервера.
    expect(await verifyPassword('не хеш вовсе', PASSWORD)).toBe(false);

    const employee = await createTestEmployee({ role: 'manager' });
    const tooShort = 'x'.repeat(PASSWORD_MIN_LENGTH - 1);

    expect(await setPassword({ employeeId: employee.employeeId, password: tooShort })).toBe(
      'too_short',
    );
    expect((await readTestEmployee(employee.employeeId))?.passwordHash).toBeNull();
  });

  it('заданный пароль пускает в веб, а неверный — нет', async () => {
    const phone = nextTestPhone();
    const employee = await createTestEmployee({ role: 'admin', phoneE164: phone });

    expect(await setPassword({ employeeId: employee.employeeId, password: PASSWORD })).toBe(
      'changed',
    );

    const signedIn = await loginByPassword({
      phoneRaw: phone,
      password: PASSWORD,
      clientAddress: CLIENT_ADDRESS,
    });

    expect(signedIn.outcome).toBe('signed_in');

    const refused = await loginByPassword({
      phoneRaw: phone,
      password: 'совершенно другой пароль',
      clientAddress: CLIENT_ADDRESS,
    });

    expect(refused.outcome).toBe('invalid_credentials');

    await clearLoginFailures(phone, CLIENT_ADDRESS);
  });

  it('пять неудач подряд на связку «телефон + адрес» включают паузу', async () => {
    const phone = nextTestPhone();
    const employee = await createTestEmployee({ role: 'admin', phoneE164: phone });

    await setPassword({ employeeId: employee.employeeId, password: PASSWORD });

    for (let attempt = 0; attempt < LOGIN_FAILURE_LIMIT; attempt += 1) {
      const failed = await loginByPassword({
        phoneRaw: phone,
        password: 'не тот пароль',
        clientAddress: CLIENT_ADDRESS,
      });

      expect(failed.outcome).toBe('invalid_credentials');
    }

    // Верный пароль после паузы тоже не принимается: смысл её в том, чтобы перебор
    // перестал получать ответы.
    const throttled = await loginByPassword({
      phoneRaw: phone,
      password: PASSWORD,
      clientAddress: CLIENT_ADDRESS,
    });

    expect(throttled.outcome).toBe('throttled');

    await clearLoginFailures(phone, CLIENT_ADDRESS);

    const afterReset = await loginByPassword({
      phoneRaw: phone,
      password: PASSWORD,
      clientAddress: CLIENT_ADDRESS,
    });

    expect(afterReset.outcome).toBe('signed_in');
  });

  it('живой cookie пускает, а выключенная учётка — нет', async () => {
    const employee = await createTestEmployee({ role: 'admin' });
    const cookieValue = sessionCookieFor(employee.employeeId, new Date());

    const allowed = await authenticateEmployee({ cookieValue, initData: null });

    expect(allowed.outcome).toBe('authenticated');

    if (allowed.outcome === 'authenticated') {
      expect(allowed.employee.employeeId).toBe(employee.employeeId);
      expect(allowed.employee.role).toBe('admin');
    }

    const disabled = await createTestEmployee({ role: 'admin', disabledAt: new Date() });
    const disabledCookie = sessionCookieFor(disabled.employeeId, new Date());

    expect((await authenticateEmployee({ cookieValue: disabledCookie, initData: null })).outcome).toBe(
      'disabled',
    );
  });

  it('смена пароля гасит cookie, выпущенные до неё', async () => {
    const employee = await createTestEmployee({ role: 'admin' });
    const issuedAt = new Date(Date.now() - 60_000);
    const cookieValue = sessionCookieFor(employee.employeeId, issuedAt);

    expect((await authenticateEmployee({ cookieValue, initData: null })).outcome).toBe(
      'authenticated',
    );

    await setPassword({ employeeId: employee.employeeId, password: PASSWORD });

    expect((await authenticateEmployee({ cookieValue, initData: null })).outcome).toBe(
      'password_changed',
    );

    // Cookie, выпущенный после смены, работает: гасятся выданные раньше, а не все навсегда.
    const freshCookie = sessionCookieFor(employee.employeeId, new Date(Date.now() + 1_000));

    expect((await authenticateEmployee({ cookieValue: freshCookie, initData: null })).outcome).toBe(
      'authenticated',
    );
  });

  it('испорченная подпись и просроченный cookie доступа не дают', async () => {
    const employee = await createTestEmployee({ role: 'admin' });
    const cookieValue = sessionCookieFor(employee.employeeId, new Date());

    // Меняется последний знак подписи: полезная часть остаётся прежней.
    const tampered = `${cookieValue.slice(0, -1)}${cookieValue.at(-1) === 'A' ? 'B' : 'A'}`;

    expect((await authenticateEmployee({ cookieValue: tampered, initData: null })).outcome).toBe(
      'invalid_credentials',
    );

    const expiredAt = new Date(Date.now() - (SESSION_MAX_AGE_SECONDS + 60) * 1_000);

    expect(
      (
        await authenticateEmployee({
          cookieValue: sessionCookieFor(employee.employeeId, expiredAt),
          initData: null,
        })
      ).outcome,
    ).toBe('invalid_credentials');

    expect((await authenticateEmployee({ cookieValue: null, initData: null })).outcome).toBe(
      'no_credentials',
    );
  });
});
