import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';
import type { EmployeeRole } from '#server/generated/prisma/enums';

/**
 * Офисы парка и закрепление за ними сотрудников.
 *
 * Офис не удаляется, а архивируется: на него ссылаются заказы, и заказ обязан помнить,
 * где его выдавали (docs/decisions.md → «Каталог: заказ — это касса, остаток живёт
 * по офисам»). Поэтому `DELETE` здесь есть ровно один — снятие привязки сотрудника,
 * у которой истории нет и хранить нечего.
 *
 * Схема в сыром SQL указывается явно — `xb.offices`, а не `offices`: `?schema=xb` в строке
 * подключения понимает Prisma, а не `pg`, и запрос без префикса молча ушёл бы в `public`
 * (docs/decisions.md → «В сыром SQL схема указывается явно»).
 */

type Executor = Prisma.TransactionClient;

export type OfficeRow = {
  id: string;
  name: string;
  address: string;
  mapUrl: string | null;
  workHours: string | null;
  phoneE164: string | null;
  telegram: string | null;
  /** Заполнено — офис закрыт: водителю не показывается и заказов не принимает. */
  archivedAt: Date | null;
  /** ДЕМО ОФИС (issue #205): живому водителю не виден и заказов от него не принимает. */
  isDemo: boolean;
  updatedAt: Date;
};

const OFFICE_COLUMNS = Prisma.sql`
  "id",
  "name",
  "address",
  "map_url"     AS "mapUrl",
  "work_hours"  AS "workHours",
  "phone_e164"  AS "phoneE164",
  "telegram",
  "archived_at" AS "archivedAt",
  "is_demo"     AS "isDemo",
  "updated_at"  AS "updatedAt"
`;

/**
 * Все офисы — и работающие, и архивные, архивные последними.
 *
 * Отбора по архивности нет намеренно: экран показывает архив признаком, а не прячет его,
 * и «офиса нет в списке» не должно означать «офис закрыт».
 */
export const listOffices = async (client: Executor = db): Promise<OfficeRow[]> =>
  client.$queryRaw<OfficeRow[]>`
    SELECT ${OFFICE_COLUMNS}
      FROM xb.offices
     ORDER BY ("archived_at" IS NOT NULL), "name"
  `;

/**
 * Работающие офисы — для водителя. Архивный офис заказов не принимает, и показывать его
 * в списке, откуда выбирают, куда ехать, значит звать в закрытую дверь.
 *
 * `includeDemo` — брать ли ДЕМО ОФИС (issue #212): живое видно всем, демо — только
 * демо-водителю. Параметр обязателен: каждый, кто собирает список, решает это явно.
 */
export const listActiveOffices = async (
  includeDemo: boolean,
  client: Executor = db,
): Promise<OfficeRow[]> =>
  client.$queryRaw<OfficeRow[]>`
    SELECT ${OFFICE_COLUMNS}
      FROM xb.offices
     WHERE "archived_at" IS NULL
       AND (${includeDemo}::boolean OR NOT "is_demo")
     ORDER BY "name"
  `;

/**
 * Офисы, к которым привязан сотрудник, — в том же порядке, что общий список: архивные
 * последними. Архивные не отбрасываются: висящий заказ закрытого офиса всё ещё надо выдать
 * или отменить.
 */
export const listEmployeeOffices = async (
  employeeId: string,
  client: Executor = db,
): Promise<OfficeRow[]> =>
  client.$queryRaw<OfficeRow[]>`
    SELECT ${OFFICE_COLUMNS}
      FROM xb.offices
     WHERE "id" IN (
             SELECT "office_id"
               FROM xb.employee_offices
              WHERE "employee_id" = ${employeeId}::uuid
           )
     ORDER BY ("archived_at" IS NOT NULL), "name"
  `;

export const findOffice = async (
  officeId: string,
  client: Executor = db,
): Promise<OfficeRow | null> => {
  const rows = await client.$queryRaw<OfficeRow[]>`
    SELECT ${OFFICE_COLUMNS}
      FROM xb.offices
     WHERE "id" = ${officeId}::uuid
  `;

  return rows[0] ?? null;
};

export type OfficeInput = {
  name: string;
  address: string;
  mapUrl: string | null;
  workHours: string | null;
  phoneE164: string | null;
  telegram: string | null;
  /** ДЕМО ОФИС (issue #205). Пусто — живой: так заводятся все, кроме `make demo-create`. */
  isDemo?: boolean;
};

export const insertOffice = async (
  input: OfficeInput,
  client: Executor = db,
): Promise<OfficeRow> => {
  const rows = await client.$queryRaw<OfficeRow[]>`
    INSERT INTO xb.offices ("name", "address", "map_url", "work_hours", "phone_e164", "telegram", "is_demo")
    VALUES (
      ${input.name},
      ${input.address},
      ${input.mapUrl},
      ${input.workHours},
      ${input.phoneE164},
      ${input.telegram},
      ${input.isDemo ?? false}
    )
    RETURNING ${OFFICE_COLUMNS}
  `;

  const office = rows[0];

  if (!office) {
    throw new Error('вставка офиса не вернула строку');
  }

  return office;
};

/**
 * Правка офиса целиком: форма отдаёт все поля сразу, и частичного обновления здесь нет.
 *
 * Пустой ответ — офиса с таким идентификатором нет. Различает это вызывающий сервис:
 * «нет такого офиса» и «нечего было менять» — разные ответы человеку.
 */
export const updateOfficeFields = async (
  officeId: string,
  input: OfficeInput,
  client: Executor = db,
): Promise<OfficeRow | null> => {
  const rows = await client.$queryRaw<OfficeRow[]>`
    UPDATE xb.offices
       SET "name"       = ${input.name},
           "address"    = ${input.address},
           "map_url"    = ${input.mapUrl},
           "work_hours" = ${input.workHours},
           "phone_e164" = ${input.phoneE164},
           "telegram"   = ${input.telegram},
           "updated_at" = now()
     WHERE "id" = ${officeId}::uuid
    RETURNING ${OFFICE_COLUMNS}
  `;

  return rows[0] ?? null;
};

/**
 * Ставит или снимает отметку архива.
 *
 * Повторный вызов с тем же значением ничего не меняет и не отказывает: две нажатые кнопки
 * «в архив» означают одно и то же состояние, и вторая не обязана быть ошибкой. Отметку
 * при этом не перебивает — иначе время закрытия офиса менялось бы от каждого лишнего нажатия.
 */
export const updateOfficeArchived = async (
  officeId: string,
  archived: boolean,
  client: Executor = db,
): Promise<OfficeRow | null> => {
  const rows = await client.$queryRaw<OfficeRow[]>`
    UPDATE xb.offices
       SET "archived_at" = CASE
             WHEN ${archived} THEN COALESCE("archived_at", now())
             ELSE NULL
           END,
           "updated_at"  = now()
     WHERE "id" = ${officeId}::uuid
    RETURNING ${OFFICE_COLUMNS}
  `;

  return rows[0] ?? null;
};

export type OfficeEmployeeRow = {
  employeeId: string;
  fullName: string;
  role: EmployeeRole;
};

export const listOfficeEmployees = async (
  officeId: string,
  client: Executor = db,
): Promise<OfficeEmployeeRow[]> =>
  client.$queryRaw<OfficeEmployeeRow[]>`
    SELECT employee."id"        AS "employeeId",
           employee."full_name" AS "fullName",
           employee."role"
      FROM xb.employee_offices AS link
      JOIN xb.employees        AS employee ON employee."id" = link."employee_id"
     WHERE link."office_id" = ${officeId}::uuid
     ORDER BY employee."full_name"
  `;

/**
 * Заменяет набор закреплённых сотрудников на присланный.
 *
 * Двумя запросами в одной транзакции, а не «удалить всё и вставить заново»: у строки есть
 * `created_at`, и снос всего набора ради добавления одного человека переписал бы время
 * закрепления остальных. Поэтому лишние снимаются по списку, а новые вставляются
 * с `ON CONFLICT DO NOTHING` — уже закреплённые остаются как были.
 *
 * Пустой список — законное значение: у офиса может не быть ни одного сотрудника.
 */
export const replaceOfficeEmployees = async (
  officeId: string,
  employeeIds: string[],
  client: Executor,
): Promise<void> => {
  await client.$executeRaw`
    DELETE FROM xb.employee_offices
     WHERE "office_id" = ${officeId}::uuid
       AND NOT ("employee_id" = ANY(${employeeIds}::uuid[]))
  `;

  if (employeeIds.length === 0) {
    return;
  }

  await client.$executeRaw`
    INSERT INTO xb.employee_offices ("employee_id", "office_id")
    SELECT "employee_id", ${officeId}::uuid
      FROM unnest(${employeeIds}::uuid[]) AS "employee_id"
    ON CONFLICT ("employee_id", "office_id") DO NOTHING
  `;
};
