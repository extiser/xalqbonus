import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';
import type { EmployeeRole } from '#server/generated/prisma/enums';

/**
 * Доступ к учёткам сотрудников.
 *
 * Сотрудники отделены от водителей целиком: ни одного запроса, соединяющего `employees`
 * с `persons`, здесь нет и быть не может — таблицы не связаны ничем (docs/decisions.md →
 * «Учётка сотрудника и роли»).
 *
 * Сырой SQL со схемой в каждой ссылке на таблицу — по той же причине, что в журнале баллов:
 * `?schema=xb` в строке подключения понимает Prisma, а не `pg`, и запрос без префикса молча
 * ушёл бы в `public` (docs/decisions.md → «В сыром SQL схема указывается явно»).
 */

/** Кто исполняет запрос: глобальный клиент или клиент транзакции. */
type Executor = Prisma.TransactionClient;

export type EmployeeRow = {
  id: string;
  role: EmployeeRole;
  fullName: string;
  phoneE164: string;
  /** `argon2id`. Пуст у того, кто в веб не ходит. */
  passwordHash: string | null;
  passwordChangedAt: Date | null;
  /** Cookie, выпущенный раньше этой отметки, недействителен. Пуста, пока сессии не гасили. */
  sessionsValidFrom: Date | null;
  telegramUserId: bigint | null;
  disabledAt: Date | null;
  /** Демо-сотрудник (issue #205): своего входа у него нет, под ним входит демо-зритель. */
  isDemo: boolean;
};

/**
 * Колонки учётки, которые читает проверка доступа. Хеш пароля в их числе намеренно:
 * второй запрос ради него на входе в веб был бы лишним, а наружу он не уходит — ответы
 * ручек собираются из полей поимённо.
 */
const EMPLOYEE_COLUMNS = Prisma.sql`
  "id",
  "role",
  "full_name"           AS "fullName",
  "phone_e164"          AS "phoneE164",
  "password_hash"       AS "passwordHash",
  "password_changed_at" AS "passwordChangedAt",
  "sessions_valid_from" AS "sessionsValidFrom",
  "telegram_user_id"    AS "telegramUserId",
  "disabled_at"         AS "disabledAt",
  "is_demo"             AS "isDemo"
`;

export const findEmployeeById = async (
  employeeId: string,
  client: Executor = db,
): Promise<EmployeeRow | null> => {
  const rows = await client.$queryRaw<EmployeeRow[]>`
    SELECT ${EMPLOYEE_COLUMNS}
      FROM xb.employees
     WHERE "id" = ${employeeId}::uuid
  `;

  return rows[0] ?? null;
};

export const findEmployeeByPhone = async (
  phoneE164: string,
  client: Executor = db,
): Promise<EmployeeRow | null> => {
  const rows = await client.$queryRaw<EmployeeRow[]>`
    SELECT ${EMPLOYEE_COLUMNS}
      FROM xb.employees
     WHERE "phone_e164" = ${phoneE164}
  `;

  return rows[0] ?? null;
};

export const findEmployeeByTelegramUserId = async (
  telegramUserId: bigint,
  client: Executor = db,
): Promise<EmployeeRow | null> => {
  const rows = await client.$queryRaw<EmployeeRow[]>`
    SELECT ${EMPLOYEE_COLUMNS}
      FROM xb.employees
     WHERE "telegram_user_id" = ${telegramUserId}
  `;

  return rows[0] ?? null;
};

/**
 * Демо-сотрудник этой роли (issue #205) — он один на роль, это держит частичный уникальный
 * индекс `employees_demo_role_key`. Выключенный тоже находится: выключение демо-учётки
 * действует так же, как у живой, и решает его проверка доступа, а не поиск.
 */
export const findDemoEmployee = async (
  role: EmployeeRole,
  client: Executor = db,
): Promise<EmployeeRow | null> => {
  const rows = await client.$queryRaw<EmployeeRow[]>`
    SELECT ${EMPLOYEE_COLUMNS}
      FROM xb.employees
     WHERE "is_demo"
       AND "role" = ${role}::xb.employee_role
  `;

  return rows[0] ?? null;
};

/**
 * Есть ли учётка на этот Telegram или на этот телефон — одним запросом.
 *
 * Именно так проверяется правило одной роли при принятии приглашения и при привязке
 * водителя: спрашивают оба признака сразу, потому что занятым может быть любой из них,
 * а исход у обоих один.
 */
export const findEmployeeByTelegramOrPhone = async (
  telegramUserId: bigint | null,
  phoneE164: string,
  client: Executor = db,
): Promise<EmployeeRow | null> => {
  const rows = await client.$queryRaw<EmployeeRow[]>`
    SELECT ${EMPLOYEE_COLUMNS}
      FROM xb.employees
     WHERE ("telegram_user_id" IS NOT NULL AND "telegram_user_id" = ${telegramUserId})
        OR "phone_e164" = ${phoneE164}
     LIMIT 1
  `;

  return rows[0] ?? null;
};

export type InsertEmployeeInput = {
  role: EmployeeRole;
  fullName: string;
  phoneE164: string;
  passwordHash: string | null;
  passwordChangedAt: Date | null;
  /** Cookie, выпущенный раньше этой отметки, недействителен. Пуста, пока сессии не гасили. */
  sessionsValidFrom: Date | null;
  telegramUserId: bigint | null;
  /** Демо-сотрудник (issue #205). Пусто — живой: так заводятся все, кроме `make demo-create`. */
  isDemo?: boolean;
};

export const insertEmployee = async (
  input: InsertEmployeeInput,
  client: Executor = db,
): Promise<EmployeeRow> => {
  const rows = await client.$queryRaw<EmployeeRow[]>`
    INSERT INTO xb.employees (
      "role", "full_name", "phone_e164", "password_hash", "password_changed_at",
      "sessions_valid_from", "telegram_user_id", "is_demo"
    )
    VALUES (
      ${input.role}::xb.employee_role,
      ${input.fullName},
      ${input.phoneE164},
      ${input.passwordHash},
      ${input.passwordChangedAt},
      ${input.sessionsValidFrom},
      ${input.telegramUserId},
      ${input.isDemo ?? false}
    )
    RETURNING ${EMPLOYEE_COLUMNS}
  `;

  const employee = rows[0];

  if (!employee) {
    throw new Error('вставка учётки сотрудника не вернула строку');
  }

  return employee;
};

/**
 * Записывает новый пароль, двигает отметку его смены и отметку годности cookie.
 *
 * Обе отметки двигаются той же записью, а не отдельной: пароль, сменившийся без сдвига
 * годности, оставил бы прежние сессии живыми (docs/decisions.md → «Сессия веба живёт
 * в подписанном cookie»).
 */
export const updateEmployeePassword = async (
  employeeId: string,
  passwordHash: string,
  changedAt: Date,
  client: Executor = db,
): Promise<void> => {
  await client.$executeRaw`
    UPDATE xb.employees
       SET "password_hash"       = ${passwordHash},
           "password_changed_at" = ${changedAt},
           "sessions_valid_from" = ${changedAt},
           "updated_at"          = now()
     WHERE "id" = ${employeeId}::uuid
  `;
};

/**
 * Двигает отметку годности, не трогая пароль, — это и есть выход из веба.
 *
 * Гасятся при этом все выданные cookie, а не один: таблицы сессий нет, и различить
 * устройства нечем. Решение осознанное — учёток десяток, а список активных сессий
 * отклонён вместе с таблицей (docs/decisions.md → «Сессия веба живёт в подписанном cookie»).
 */
export const revokeEmployeeSessions = async (
  employeeId: string,
  revokedAt: Date,
  client: Executor = db,
): Promise<void> => {
  await client.$executeRaw`
    UPDATE xb.employees
       SET "sessions_valid_from" = ${revokedAt},
           "updated_at"          = now()
     WHERE "id" = ${employeeId}::uuid
  `;
};

/**
 * Выключает или включает учётку. `null` — включить.
 *
 * Повторное выключение время не двигает: две нажатые кнопки означают одно состояние,
 * и время выключения остаётся тем, когда доступ закрыли на самом деле.
 *
 * Отметку годности сессий не трогает: `disabled_at` проверяется на каждом запросе сам.
 */
export const updateEmployeeDisabled = async (
  employeeId: string,
  disabledAt: Date | null,
  client: Executor = db,
): Promise<void> => {
  await client.$executeRaw`
    UPDATE xb.employees
       SET "disabled_at" = CASE
                             WHEN ${disabledAt}::timestamptz IS NULL THEN NULL
                             ELSE COALESCE("disabled_at", ${disabledAt}::timestamptz)
                           END,
           "updated_at"  = now()
     WHERE "id" = ${employeeId}::uuid
  `;
};

/**
 * Обнуляет пароль и гасит выданные cookie — одной записью, как и смена пароля.
 *
 * Только у учётки, у которой пароль есть: условие стоит в самом `UPDATE`, и нажатие
 * на учётке без пароля не двигает отметку годности сессий. `true` — пароль был и сброшен.
 */
export const clearEmployeePassword = async (
  employeeId: string,
  clearedAt: Date,
  client: Executor = db,
): Promise<boolean> => {
  const updated = await client.$executeRaw`
    UPDATE xb.employees
       SET "password_hash"       = NULL,
           "password_changed_at" = ${clearedAt},
           "sessions_valid_from" = ${clearedAt},
           "updated_at"          = now()
     WHERE "id" = ${employeeId}::uuid
       AND "password_hash" IS NOT NULL
  `;

  return updated === 1;
};

export type EmployeeAccountRow = {
  id: string;
  fullName: string;
  role: EmployeeRole;
  disabledAt: Date | null;
};

export type EmployeeDirectoryOfficeRow = {
  officeId: string;
  name: string;
  archived: boolean;
};

export type EmployeeDirectoryRow = EmployeeAccountRow & {
  phoneE164: string;
  /** Признак, а не хеш: хеш из репозитория в список не уходит ни в каком виде. */
  passwordSet: boolean;
  /** Офисы из `employee_offices`: работающие первыми, архивные последними. */
  offices: EmployeeDirectoryOfficeRow[];
  /** Демо-сотрудник (issue #205): править его может только владелец (issue #212). */
  isDemo: boolean;
};

/**
 * Учётки парка для экрана сотрудников и для выбора на странице офиса.
 *
 * Офисы собираются в том же запросе, а не вторым на каждую учётку: сотрудников десяток,
 * но запрос на строку — это та цена, которая растёт незаметно.
 *
 * Выключенные учётки в ответе есть: сотрудник, которому закрыли доступ на время, за офисом
 * остаётся закреплённым, и прятать его из списка значило бы терять состав офиса при первом
 * же выключении.
 */
export const listEmployeeDirectory = async (
  client: Executor = db,
): Promise<EmployeeDirectoryRow[]> =>
  client.$queryRaw<EmployeeDirectoryRow[]>`
    SELECT employee."id",
           employee."full_name"               AS "fullName",
           employee."role",
           employee."disabled_at"             AS "disabledAt",
           employee."phone_e164"              AS "phoneE164",
           employee."password_hash" IS NOT NULL AS "passwordSet",
           employee."is_demo"                 AS "isDemo",
           COALESCE(
             (SELECT json_agg(
                       json_build_object(
                         'officeId', office."id",
                         'name',     office."name",
                         'archived', office."archived_at" IS NOT NULL
                       )
                       ORDER BY (office."archived_at" IS NOT NULL), office."name"
                     )
                FROM xb.employee_offices AS link
                JOIN xb.offices          AS office ON office."id" = link."office_id"
               WHERE link."employee_id" = employee."id"),
             '[]'::json
           )                                  AS "offices"
      FROM xb.employees AS employee
     ORDER BY employee."full_name"
  `;

/**
 * Учётки по списку идентификаторов. Нужна проверке состава офиса: закрепить можно
 * за существующей учёткой, и «столько же строк, сколько спросили» — единственное,
 * что об этом говорит.
 */
export const findEmployeesByIds = async (
  employeeIds: string[],
  client: Executor = db,
): Promise<EmployeeAccountRow[]> =>
  client.$queryRaw<EmployeeAccountRow[]>`
    SELECT "id",
           "full_name"   AS "fullName",
           "role",
           "disabled_at" AS "disabledAt"
      FROM xb.employees
     WHERE "id" = ANY(${employeeIds}::uuid[])
  `;
