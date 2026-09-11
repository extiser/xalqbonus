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
  phoneE164: string | null;
  /** `argon2id`. Пуст у того, кто в веб не ходит. */
  passwordHash: string | null;
  passwordChangedAt: Date | null;
  telegramUserId: bigint | null;
  disabledAt: Date | null;
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
  "telegram_user_id"    AS "telegramUserId",
  "disabled_at"         AS "disabledAt"
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
 * Есть ли учётка на этот Telegram или на этот телефон — одним запросом.
 *
 * Именно так проверяется правило одной роли при принятии приглашения и при привязке
 * водителя: спрашивают оба признака сразу, потому что занятым может быть любой из них,
 * а исход у обоих один.
 */
export const findEmployeeByTelegramOrPhone = async (
  telegramUserId: bigint | null,
  phoneE164: string | null,
  client: Executor = db,
): Promise<EmployeeRow | null> => {
  const rows = await client.$queryRaw<EmployeeRow[]>`
    SELECT ${EMPLOYEE_COLUMNS}
      FROM xb.employees
     WHERE ("telegram_user_id" IS NOT NULL AND "telegram_user_id" = ${telegramUserId})
        OR ("phone_e164" IS NOT NULL AND "phone_e164" = ${phoneE164})
     LIMIT 1
  `;

  return rows[0] ?? null;
};

export type InsertEmployeeInput = {
  role: EmployeeRole;
  fullName: string;
  phoneE164: string | null;
  passwordHash: string | null;
  passwordChangedAt: Date | null;
  telegramUserId: bigint | null;
};

export const insertEmployee = async (
  input: InsertEmployeeInput,
  client: Executor = db,
): Promise<EmployeeRow> => {
  const rows = await client.$queryRaw<EmployeeRow[]>`
    INSERT INTO xb.employees (
      "role", "full_name", "phone_e164", "password_hash", "password_changed_at", "telegram_user_id"
    )
    VALUES (
      ${input.role}::xb.employee_role,
      ${input.fullName},
      ${input.phoneE164},
      ${input.passwordHash},
      ${input.passwordChangedAt},
      ${input.telegramUserId}
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
 * Записывает новый пароль и двигает отметку его смены.
 *
 * Отметка двигается той же записью, а не отдельной: именно по ней гасятся все выданные
 * cookie, и пароль, сменившийся без сдвига отметки, оставил бы прежние сессии живыми
 * (docs/decisions.md → «Сессия веба живёт в подписанном cookie»).
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
           "updated_at"          = now()
     WHERE "id" = ${employeeId}::uuid
  `;
};
