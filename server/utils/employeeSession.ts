import { createHmac, timingSafeEqual } from 'node:crypto';

import type { EmployeeRole } from '#server/generated/prisma/enums';

/**
 * Подписанный cookie сессии сотрудника.
 *
 * Таблицы сессий нет: в вебе учётка на каждом запросе всё равно поднимается из базы ради
 * актуальной роли, поэтому `disabled_at` выбрасывает человека немедленно,
 * а `sessions_valid_from` позже времени выпуска делает cookie недействительным — это и есть
 * «выйти на всех устройствах». Двигают эту отметку два события, выход из веба и смена
 * пароля, а проверяется она одна (docs/decisions.md → «Сессия веба живёт в подписанном
 * cookie»).
 *
 * Содержимое cookie — не секрет, а утверждение: кто вошёл, с какой ролью и когда. Подпись
 * доказывает, что утверждение выписали мы. Шифровать его незачем — ни одного значения,
 * которого владелец cookie не знает про себя сам, внутри нет.
 *
 * Роль лежит в cookie, но основанием для доступа не является: она читается из базы на
 * каждом запросе. Значение внутри — подсказка для лога и отладки, и расхождение с базой
 * решается в пользу базы (docs/principles.md → «Доверие к входным данным»).
 *
 * Функции чистые: ни базы, ни `process.env`. Секрет приходит аргументом — по той же
 * причине, по которой токен бота приходит аргументом в проверку `initData`.
 */

/** Имя cookie. Одно на всё приложение: второй двери в веб нет. */
export const SESSION_COOKIE_NAME = 'xb_employee_session';

/** Что лежит внутри подписанного значения. */
export type EmployeeSession = {
  employeeId: string;
  role: EmployeeRole;
  /** Время выпуска, секунды эпохи. По нему гасятся cookie при смене пароля. */
  issuedAtSeconds: number;
};

/** Причины отказа. Все, кроме `valid`, означают «сессии нет». */
export type SessionOutcome =
  | 'valid'
  /** Cookie не прислали вовсе. */
  | 'missing'
  /** Значение не разбирается: не та форма, не тот base64, не тот JSON. */
  | 'malformed'
  /** Подпись не сошлась: значение собрал не мы или его правили по дороге. */
  | 'signature_mismatch'
  /** Подпись верна, но cookie старше предела. */
  | 'expired';

export type SessionCheck =
  | ({ outcome: 'valid' } & EmployeeSession)
  | { outcome: Exclude<SessionOutcome, 'valid'> };

/** Сырое содержимое разобранного JSON: чужая строка до того, как мы в ней что-то признали. */
type RawSession = {
  employeeId?: unknown;
  role?: unknown;
  issuedAtSeconds?: unknown;
};

const ROLES: readonly EmployeeRole[] = ['owner', 'admin', 'manager'];

const isRole = (value: unknown): value is EmployeeRole =>
  typeof value === 'string' && ROLES.includes(value as EmployeeRole);

/**
 * Сверка подписи за постоянное время — по той же причине, что у `initData`: посимвольное
 * сравнение выдаёт длину совпавшего префикса временем ответа.
 */
const signaturesMatch = (expected: string, received: string): boolean => {
  const expectedBytes = Buffer.from(expected, 'base64url');
  const receivedBytes = Buffer.from(received, 'base64url');

  if (expectedBytes.length === 0 || expectedBytes.length !== receivedBytes.length) {
    return false;
  }

  return timingSafeEqual(expectedBytes, receivedBytes);
};

const sign = (payload: string, secret: string): string =>
  createHmac('sha256', secret).update(payload).digest('base64url');

const requireSecret = (secret: string): void => {
  // Пустой секрет — не отказ подписи, а машина без настроенного входа: подписывать нечем.
  // Молчаливая подпись пустым ключом дала бы cookie, который подделывает кто угодно.
  if (secret === '') {
    throw new Error('секрет сессии пуст: подписывать и проверять cookie сотрудника нечем');
  }
};

/** Собирает значение cookie: полезная часть и подпись через точку. */
export const signEmployeeSession = (session: EmployeeSession, secret: string): string => {
  requireSecret(secret);

  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');

  return `${payload}.${sign(payload, secret)}`;
};

export type SessionCheckRequest = {
  /** Значение cookie, как его прислал браузер. `null`, если его нет вовсе. */
  cookieValue: string | null;
  secret: string;
  maxAgeSeconds: number;
  /** Момент проверки. Аргументом — чтобы «просроченный cookie» проверялся тестом. */
  now?: Date;
};

/**
 * Проверяет подпись cookie и читает из него сессию.
 *
 * Порядок проверок неслучаен: подпись сверяется **до** чтения любого поля. Прочитать
 * идентификатор сотрудника из значения с несошедшейся подписью значит поверить клиенту
 * на слово — ровно то, из-за чего в старом проекте роль назначалась одним сообщением боту.
 */
export const checkEmployeeSession = (request: SessionCheckRequest): SessionCheck => {
  requireSecret(request.secret);

  const { cookieValue } = request;

  if (cookieValue === null || cookieValue.trim() === '') {
    return { outcome: 'missing' };
  }

  const separatorIndex = cookieValue.lastIndexOf('.');

  if (separatorIndex <= 0 || separatorIndex === cookieValue.length - 1) {
    return { outcome: 'malformed' };
  }

  const payload = cookieValue.slice(0, separatorIndex);
  const receivedSignature = cookieValue.slice(separatorIndex + 1);

  if (!signaturesMatch(sign(payload, request.secret), receivedSignature)) {
    return { outcome: 'signature_mismatch' };
  }

  let parsed: RawSession;

  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as RawSession;
  } catch {
    return { outcome: 'malformed' };
  }

  if (
    typeof parsed.employeeId !== 'string' ||
    !isRole(parsed.role) ||
    typeof parsed.issuedAtSeconds !== 'number' ||
    !Number.isInteger(parsed.issuedAtSeconds)
  ) {
    return { outcome: 'malformed' };
  }

  const nowSeconds = Math.floor((request.now ?? new Date()).getTime() / 1000);

  if (nowSeconds - parsed.issuedAtSeconds > request.maxAgeSeconds) {
    return { outcome: 'expired' };
  }

  return {
    outcome: 'valid',
    employeeId: parsed.employeeId,
    role: parsed.role,
    issuedAtSeconds: parsed.issuedAtSeconds,
  };
};
