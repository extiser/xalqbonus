import { db } from '#server/db';
import type { Prisma } from '#server/generated/prisma/client';
import type { EmployeeRole } from '#server/generated/prisma/enums';

/**
 * Доступ к приглашениям сотрудников.
 *
 * Токена в базе нет нигде: хранится только `sha256` от него, и поиск идёт по хешу —
 * дамп базы не должен давать готовых приглашений (docs/decisions.md → «Учётка сотрудника
 * и роли»).
 */

type Executor = Prisma.TransactionClient;

export type EmployeeInviteRow = {
  id: string;
  role: EmployeeRole;
  invitedById: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  employeeId: string | null;
  revokedAt: Date | null;
};

export type InsertEmployeeInviteInput = {
  role: EmployeeRole;
  tokenHash: string;
  invitedById: string;
  expiresAt: Date;
};

export const insertEmployeeInvite = async (
  input: InsertEmployeeInviteInput,
  client: Executor = db,
): Promise<EmployeeInviteRow> => {
  const rows = await client.$queryRaw<EmployeeInviteRow[]>`
    INSERT INTO xb.employee_invites ("role", "token_hash", "invited_by_id", "expires_at")
    VALUES (
      ${input.role}::xb.employee_role,
      ${input.tokenHash},
      ${input.invitedById}::uuid,
      ${input.expiresAt}
    )
    RETURNING "id",
              "role",
              "invited_by_id" AS "invitedById",
              "expires_at"    AS "expiresAt",
              "accepted_at"   AS "acceptedAt",
              "employee_id"   AS "employeeId",
              "revoked_at"    AS "revokedAt"
  `;

  const invite = rows[0];

  if (!invite) {
    throw new Error('вставка приглашения не вернула строку');
  }

  return invite;
};

export const findEmployeeInviteByTokenHash = async (
  tokenHash: string,
  client: Executor = db,
): Promise<EmployeeInviteRow | null> => {
  const rows = await client.$queryRaw<EmployeeInviteRow[]>`
    SELECT "id",
           "role",
           "invited_by_id" AS "invitedById",
           "expires_at"    AS "expiresAt",
           "accepted_at"   AS "acceptedAt",
           "employee_id"   AS "employeeId",
           "revoked_at"    AS "revokedAt"
      FROM xb.employee_invites
     WHERE "token_hash" = ${tokenHash}
  `;

  return rows[0] ?? null;
};

export const findEmployeeInviteById = async (
  inviteId: string,
  client: Executor = db,
): Promise<EmployeeInviteRow | null> => {
  const rows = await client.$queryRaw<EmployeeInviteRow[]>`
    SELECT "id",
           "role",
           "invited_by_id" AS "invitedById",
           "expires_at"    AS "expiresAt",
           "accepted_at"   AS "acceptedAt",
           "employee_id"   AS "employeeId",
           "revoked_at"    AS "revokedAt"
      FROM xb.employee_invites
     WHERE "id" = ${inviteId}::uuid
  `;

  return rows[0] ?? null;
};

/**
 * Отмечает приглашение принятым — и только непринятое, живое и неотозванное.
 *
 * Условие стоит в самом `UPDATE`, а не проверкой перед ним: две одновременные попытки
 * принять одну ссылку иначе обе прочитали бы «ещё не принято» и завели по учётке.
 * Ноль изменённых строк здесь означает «кто-то успел раньше» — это рабочий исход,
 * а не поломка (docs/principles.md → «Идемпотентность вместо аккуратности»).
 */
export const markEmployeeInviteAccepted = async (
  inviteId: string,
  employeeId: string,
  acceptedAt: Date,
  client: Executor = db,
): Promise<boolean> => {
  const updated = await client.$executeRaw`
    UPDATE xb.employee_invites
       SET "accepted_at" = ${acceptedAt},
           "employee_id" = ${employeeId}::uuid
     WHERE "id" = ${inviteId}::uuid
       AND "accepted_at" IS NULL
       AND "revoked_at" IS NULL
       AND "expires_at" > ${acceptedAt}
  `;

  return updated === 1;
};

/**
 * Отзывает приглашение. Отозвать можно только непринятое: у принятого уже есть учётка,
 * и выключается она `disabled_at`, а не отзывом ссылки.
 */
export const markEmployeeInviteRevoked = async (
  inviteId: string,
  revokedAt: Date,
  client: Executor = db,
): Promise<boolean> => {
  const updated = await client.$executeRaw`
    UPDATE xb.employee_invites
       SET "revoked_at" = ${revokedAt}
     WHERE "id" = ${inviteId}::uuid
       AND "accepted_at" IS NULL
       AND "revoked_at" IS NULL
  `;

  return updated === 1;
};
