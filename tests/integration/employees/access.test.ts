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
import { signOut } from '#server/services/employees/signOut';
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
 * Вход сотрудника и проверка доступа: пароль, выключенная учётка, погашенные выходом
 * и сменой пароля cookie, пауза при подборе.
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
      'sessions_revoked',
    );

    // Cookie, выпущенный после смены, работает: гасятся выданные раньше, а не все навсегда.
    const freshCookie = sessionCookieFor(employee.employeeId, new Date(Date.now() + 1_000));

    expect((await authenticateEmployee({ cookieValue: freshCookie, initData: null })).outcome).toBe(
      'authenticated',
    );
  });

  it('выход гасит cookie, сохранённый до него', async () => {
    const employee = await createTestEmployee({ role: 'admin' });
    const issuedAt = new Date(Date.now() - 60_000);

    // Ровно то значение, которое сохранил бы себе укравший его: выход обязан обесценить
    // саму строку, а не только убрать её из браузера.
    const savedCookie = sessionCookieFor(employee.employeeId, issuedAt);

    expect((await authenticateEmployee({ cookieValue: savedCookie, initData: null })).outcome).toBe(
      'authenticated',
    );

    await signOut({ employeeId: employee.employeeId });

    expect((await authenticateEmployee({ cookieValue: savedCookie, initData: null })).outcome).toBe(
      'sessions_revoked',
    );

    // Пароль выходом не трогается: гасится годность сессий, и только она.
    const afterSignOut = await readTestEmployee(employee.employeeId);

    expect(afterSignOut?.passwordChangedAt).toBeNull();
    expect(afterSignOut?.sessionsValidFrom).not.toBeNull();

    // Следующий вход выдаёт годный cookie: выход гасит выданное, а не закрывает учётку.
    expect(
      (
        await authenticateEmployee({
          cookieValue: sessionCookieFor(employee.employeeId, new Date(Date.now() + 1_000)),
          initData: null,
        })
      ).outcome,
    ).toBe('authenticated');
  });

  it('испорченная подпись и просроченный cookie доступа не дают', async () => {
    const employee = await createTestEmployee({ role: 'admin' });
    const cookieValue = sessionCookieFor(employee.employeeId, new Date());

    // Меняется знак в середине подписи: полезная часть остаётся прежней.
    //
    // В середине, а не последний, и это не придирка: подпись сверяется байтами, а последний
    // знак base64url несёт четыре значащих бита из шести — правка двух остальных даёт ту же
    // строку байтов, и тест падал примерно раз в пять прогонов, ничего при этом не находя.
    const signatureStart = cookieValue.lastIndexOf('.') + 1;
    const tamperedAt = signatureStart + Math.floor((cookieValue.length - signatureStart) / 2);
    const tampered =
      cookieValue.slice(0, tamperedAt) +
      (cookieValue[tamperedAt] === 'A' ? 'B' : 'A') +
      cookieValue.slice(tamperedAt + 1);

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
